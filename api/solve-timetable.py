import json
import sys
import os
from http.server import BaseHTTPRequestHandler

try:
    from ortools.sat.python import cp_model
    HAS_OR_TOOLS = True
except ImportError:
    HAS_OR_TOOLS = False


class TimetableSolutionCallback(cp_model.CpSolverSolutionCallback):
    def __init__(self, lesson_units, valid_slots, X, preserved_lessons):
        cp_model.CpSolverSolutionCallback.__init__(self)
        self.lesson_units = lesson_units
        self.valid_slots = valid_slots
        self.X = X
        self.preserved_lessons = preserved_lessons
        self.best_placed_lessons = None
        self.solution_count = 0

    def on_solution_callback(self):
        self.solution_count += 1
        placed = list(self.preserved_lessons)
        for i, unit in enumerate(self.lesson_units):
            for (d, p) in self.valid_slots[i]:
                if self.Value(self.X[i, d, p]) == 1:
                    placed.append({
                        "allocationId": unit["alloc_id"],
                        "day": d,
                        "period": p,
                    })
                    break
        self.best_placed_lessons = placed


def solve_cp_sat(data):
    if not HAS_OR_TOOLS:
        return {"status": "ERROR", "message": "ortools library is not installed"}

    model = cp_model.CpModel()

    allocations = data.get("allocations", [])
    teachers = data.get("teachers", [])
    classes = data.get("classes", [])
    subjects = data.get("subjects", [])
    preserved_lessons = data.get("preservedLessons", [])

    # Lookups
    teacher_dict = {t["id"]: t for t in teachers}
    class_dict = {c["id"]: c for c in classes}
    subject_dict = {s["id"]: s for s in subjects}
    all_alloc_dict = {a["id"]: a for a in allocations}

    # Filter out active allocations (non-traveling teachers)
    active_allocations = [
        a for a in allocations
        if not teacher_dict.get(a["teacherId"], {}).get("isTraveling", False)
    ]

    # Expand active allocations into lesson units
    lesson_units = []
    for alloc in active_allocations:
        for _ in range(alloc.get("weeklyHours", 1)):
            t_id = alloc["teacherId"]
            c_id = alloc["classId"]
            s_id = alloc["subjectId"]
            c_name = class_dict.get(c_id, {}).get("name", "")
            s_name = subject_dict.get(s_id, {}).get("name", "")
            group_name = alloc.get("originalGroup", "") or ""

            lesson_units.append({
                "alloc_id": alloc["id"],
                "teacher_id": t_id,
                "class_id": c_id,
                "subject_id": s_id,
                "class_name": c_name,
                "subject_name": s_name,
                "group_name": group_name,
            })

    num_lessons = len(lesson_units)
    DAYS = 5
    PERIODS = 8  # 0..7 (1. - 8. óra)

    # Map preserved lessons into occupied slots & counts
    teacher_busy_slots = set()         # (teacher_id, d, p)
    class_whole_busy_slots = set()     # (class_id, d, p)
    class_group_busy_slots = set()     # (class_id, group_name, d, p)
    class_day_napkozi_periods = {}     # (class_id, d) -> list of periods
    class_day_pe_counts = {}           # (class_id, d) -> count

    new_alloc_ids = {a["id"] for a in active_allocations}
    for p_les in preserved_lessons:
        alloc_id = p_les.get("allocationId")
        if alloc_id in new_alloc_ids:
            continue  # Do not block slots for allocations being scheduled in this phase!
        d = p_les.get("day")
        p = p_les.get("period")
        if alloc_id in all_alloc_dict and d is not None and p is not None:
            alloc = all_alloc_dict[alloc_id]
            t_id = alloc["teacherId"]
            c_id = alloc["classId"]
            s_id = alloc["subjectId"]
            g_name = (alloc.get("originalGroup") or "").strip().lower()
            s_name = subject_dict.get(s_id, {}).get("name", "").lower()

            teacher_busy_slots.add((t_id, d, p))

            if not g_name or "közös" in g_name or "egész" in g_name or g_name == "0":
                class_whole_busy_slots.add((c_id, d, p))
            else:
                class_group_busy_slots.add((c_id, g_name, d, p))

            if "napközi" in s_name or "tanulószoba" in s_name or "szabadidő" in s_name:
                key = (c_id, d)
                if key not in class_day_napkozi_periods:
                    class_day_napkozi_periods[key] = []
                class_day_napkozi_periods[key].append(p)

            if "testnevelés" in s_name or "tesi" in s_name:
                key = (c_id, d)
                class_day_pe_counts[key] = class_day_pe_counts.get(key, 0) + 1

    if num_lessons == 0:
        return {"status": "OPTIMAL", "placedLessons": preserved_lessons}

    # Pre-compute teacher required hours vs available un-busy slots
    teacher_hours_needed = {}
    for unit in lesson_units:
        t_id = unit["teacher_id"]
        teacher_hours_needed[t_id] = teacher_hours_needed.get(t_id, 0) + 1

    teachers_relax_avail = set()
    for t_id, needed in teacher_hours_needed.items():
        t = teacher_dict.get(t_id)
        avail = t.get("availability", []) if t else []
        avail_count = 0
        for d in range(DAYS):
            for p in range(PERIODS):
                if not (d < len(avail) and p < len(avail[d]) and avail[d][p] is False) and (t_id, d, p) not in teacher_busy_slots:
                    avail_count += 1
        if avail_count < needed:
            teachers_relax_avail.add(t_id)

    # Pre-compute valid (day, period) slots per new lesson unit
    valid_slots = {}  # lesson_idx -> list of (d, p)
    for i, unit in enumerate(lesson_units):
        t_id = unit["teacher_id"]
        c_id = unit["class_id"]
        g_name = unit["group_name"].strip().lower()
        s_name = unit["subject_name"].lower()
        is_hab = "habilitáció" in s_name or "rehabilitáció" in s_name
        is_whole = not g_name or "közös" in g_name or "egész" in g_name or g_name == "0"

        t = teacher_dict.get(t_id)
        avail = t.get("availability", []) if t else []
        relax_avail = t_id in teachers_relax_avail

        slots = []
        for d in range(DAYS):
            for p in range(PERIODS):
                # 1. Teacher availability check (unless relaxed due to insufficient slots)
                if not relax_avail and d < len(avail) and p < len(avail[d]) and avail[d][p] is False:
                    continue
                # 2. Teacher busy from preserved lesson check
                if (t_id, d, p) in teacher_busy_slots:
                    continue
                # 3. Class busy from preserved whole-class lesson check
                if (c_id, d, p) in class_whole_busy_slots:
                    if is_hab and p in class_day_napkozi_periods.get((c_id, d), []):
                        pass  # allowed
                    else:
                        continue
                # 4. If whole class lesson, check if class has ANY preserved group lesson at (d,p)
                if is_whole:
                    if (c_id, d, p) in class_whole_busy_slots or any((c_id, g, d, p) in class_group_busy_slots for g in ["group1", "group2", "fiú", "lány"]):
                        if is_hab and p in class_day_napkozi_periods.get((c_id, d), []):
                            pass
                        else:
                            continue

                slots.append((d, p))
        valid_slots[i] = slots if slots else [(d, p) for d in range(DAYS) for p in range(PERIODS)]

    # Decision variables X[i, d, p] -> Bool
    X = {}
    for i in range(num_lessons):
        for (d, p) in valid_slots[i]:
            X[i, d, p] = model.NewBoolVar(f"x_{i}_{d}_{p}")

    # HARD CONSTRAINT 1: Each new lesson unit placed exactly once
    for i in range(num_lessons):
        model.AddExactlyOne(X[i, d, p] for (d, p) in valid_slots[i])

    # HARD CONSTRAINT 2: Strict Teacher Collision (among new lessons)
    teacher_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        t_id = unit["teacher_id"]
        if t_id not in teacher_to_lessons:
            teacher_to_lessons[t_id] = []
        teacher_to_lessons[t_id].append(i)

    for t_id, indices in teacher_to_lessons.items():
        if len(indices) <= 1:
            continue
        for d in range(DAYS):
            for p in range(PERIODS):
                slot_vars = [X[idx, d, p] for idx in indices if (d, p) in valid_slots[idx]]
                if len(slot_vars) > 1:
                    model.Add(sum(slot_vars) <= 1)

    # HARD CONSTRAINT 3: Class & Group Collisions (among new lessons)
    class_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        c_id = unit["class_id"]
        if c_id not in class_to_lessons:
            class_to_lessons[c_id] = []
        class_to_lessons[c_id].append(i)

    for c_id, indices in class_to_lessons.items():
        if len(indices) <= 1:
            continue
        c_name = class_dict.get(c_id, {}).get("name", "").lower()
        is_9_10 = "9." in c_name or "10." in c_name

        # Build conflict pairs for all lessons belonging to class c_id
        conflict_pairs = []
        for idx_a_pos, idx_a in enumerate(indices):
            s_a = lesson_units[idx_a]["subject_name"].lower()
            t_a = lesson_units[idx_a]["teacher_id"]
            g_a = lesson_units[idx_a]["group_name"].strip().lower()
            is_hab_a = "habilitáció" in s_a or "rehabilitáció" in s_a
            is_nap_a = "napközi" in s_a or "tanulószoba" in s_a or "szabadidő" in s_a
            is_tesi_a = "testnevelés" in s_a or "tesi" in s_a
            is_whole_a = not g_a or "közös" in g_a or "egész" in g_a or g_a == "0"

            for idx_b in indices[idx_a_pos + 1:]:
                s_b = lesson_units[idx_b]["subject_name"].lower()
                t_b = lesson_units[idx_b]["teacher_id"]
                g_b = lesson_units[idx_b]["group_name"].strip().lower()
                is_hab_b = "habilitáció" in s_b or "rehabilitáció" in s_b
                is_nap_b = "napközi" in s_b or "tanulószoba" in s_b or "szabadidő" in s_b
                is_tesi_b = "testnevelés" in s_b or "tesi" in s_b
                is_whole_b = not g_b or "közös" in g_b or "egész" in g_b or g_b == "0"

                # Exception 1: Habilitacio + Napkozi by DIFFERENT teachers
                allow_nap_hab = (is_hab_a and is_nap_b and t_a != t_b) or (is_hab_b and is_nap_a and t_a != t_b)
                # Exception 2: Habilitacio + Tesi in 9-10. grade by DIFFERENT teachers
                allow_tesi_hab = is_9_10 and ((is_hab_a and is_tesi_b and t_a != t_b) or (is_hab_b and is_tesi_a and t_a != t_b))
                # Exception 3: Napkozi + Napkozi by DIFFERENT teachers
                allow_nap_nap = is_nap_a and is_nap_b and t_a != t_b

                if allow_nap_hab or allow_tesi_hab or allow_nap_nap:
                    continue  # These are explicitly allowed to be parallel!

                # If both are whole class OR both belong to same subgroup -> conflict!
                if (is_whole_a or is_whole_b) or (g_a != "" and g_a == g_b):
                    conflict_pairs.append((idx_a, idx_b))

        # Apply conflict pair constraints
        for (idx_a, idx_b) in conflict_pairs:
            for d in range(DAYS):
                for p in range(PERIODS):
                    if (d, p) in valid_slots[idx_a] and (d, p) in valid_slots[idx_b]:
                        model.Add(X[idx_a, d, p] + X[idx_b, d, p] <= 1)

    # SOFT CONSTRAINTS (Objective Penalties for Pedagogical Rules)
    penalties = []

    # Soft 1: Grade Level Time Windows
    for i, unit in enumerate(lesson_units):
        s_name = unit["subject_name"].lower()
        c_name = unit["class_name"].lower()
        is_napközi = "napközi" in s_name or "tanulószoba" in s_name or "szabadidő" in s_name
        is_habilitáció = "habilitáció" in s_name or "rehabilitáció" in s_name

        is_7_8 = "7." in c_name or "8." in c_name
        is_4 = "4." in c_name

        for (d, p) in valid_slots[i]:
            pen_val = 0
            if is_7_8:
                if is_napközi or is_habilitáció:
                    if p < 6: pen_val = 5000
                else:
                    if p >= 6: pen_val = 5000
            elif is_4:
                if is_napközi or is_habilitáció:
                    if p < 5: pen_val = 5000
                else:
                    if p >= 5: pen_val = 5000
            else:
                if is_napközi or is_habilitáció:
                    if p < 4: pen_val = 5000
                else:
                    if p >= 7: pen_val = 5000

            if pen_val > 0:
                penalties.append(X[i, d, p] * pen_val)

    # Soft 2: Academic Lesson After Napközi on Same Day (using direct slot penalties)
    for c_id, indices in class_to_lessons.items():
        academic_indices = [idx for idx in indices if "napközi" not in lesson_units[idx]["subject_name"].lower() and "tanulószoba" not in lesson_units[idx]["subject_name"].lower() and "habilitáció" not in lesson_units[idx]["subject_name"].lower()]

        for d in range(DAYS):
            preserved_nap_periods = class_day_napkozi_periods.get((c_id, d), [])

            for idx_acad in academic_indices:
                for (d_acad, p_acad) in valid_slots[idx_acad]:
                    if d_acad != d:
                        continue
                    # Check against preserved Napközi
                    for p_nap in preserved_nap_periods:
                        if p_acad >= p_nap:
                            penalties.append(X[idx_acad, d_acad, p_acad] * 10000)

    # Soft 3: Mindennapos Testnevelés
    for c_id, indices in class_to_lessons.items():
        c_name = class_dict.get(c_id, {}).get("name", "").lower()
        pe_indices = [idx for idx in indices if "testnevelés" in lesson_units[idx]["subject_name"].lower() or "tesi" in lesson_units[idx]["subject_name"].lower()]

        is_grade_3 = "3." in c_name or "3/a" in c_name or "3/b" in c_name or c_name.startswith("3 ") or c_name == "3"
        is_grade_5 = "5." in c_name or "5/a" in c_name or "5/b" in c_name or c_name.startswith("5 ") or c_name == "5"

        for d in range(DAYS):
            is_swimming_day = (is_grade_3 and d == 2) or (is_grade_5 and d == 4)
            target_pe = 2 if is_swimming_day else 1
            prev_pe = class_day_pe_counts.get((c_id, d), 0)

            new_pe_vars = [X[idx, d_x, p] for idx in pe_indices for (d_x, p) in valid_slots[idx] if d_x == d]

            if is_swimming_day and len(pe_indices) > 0:
                for idx in pe_indices:
                    for (d_x, p) in valid_slots[idx]:
                        if d_x == d and p not in (0, 1):
                            penalties.append(X[idx, d_x, p] * 5000)

            if len(new_pe_vars) > 1 and not is_swimming_day:
                for pos1 in range(len(new_pe_vars)):
                    for pos2 in range(pos1 + 1, len(new_pe_vars)):
                        bad_pair = model.NewBoolVar(f"pe_mult_{c_id}_{d}_{pos1}_{pos2}")
                        model.AddBoolAnd([new_pe_vars[pos1], new_pe_vars[pos2]]).OnlyEnforceIf(bad_pair)
                        penalties.append(bad_pair * 3000)

    # Minimize total penalties
    if penalties:
        model.Minimize(sum(penalties))

    # Solve model with SolutionCallback to capture feasible solutions
    cb = TimetableSolutionCallback(lesson_units, valid_slots, X, preserved_lessons)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver.parameters.num_search_workers = 1
    solver.parameters.log_search_progress = False

    status = solver.Solve(model, cb)

    placed_result = cb.best_placed_lessons

    # If CP-SAT callback did not return a complete placement (e.g. status UNKNOWN on Vercel timeout)
    if placed_result is None or len(placed_result) < len(preserved_lessons) + num_lessons:
        temp_placed = list(preserved_lessons)
        used_t_slots = set(teacher_busy_slots)
        used_c_slots = set(class_whole_busy_slots)

        for p_les in preserved_lessons:
            alloc_id = p_les.get("allocationId")
            d = p_les.get("day")
            p = p_les.get("period")
            if alloc_id in all_alloc_dict and d is not None and p is not None:
                alloc = all_alloc_dict[alloc_id]
                used_t_slots.add((alloc["teacherId"], d, p))
                used_c_slots.add((alloc["classId"], d, p))

        for i, unit in enumerate(lesson_units):
            t_id = unit["teacher_id"]
            c_id = unit["class_id"]
            assigned_slot = None

            # First check if CP-SAT assigned this variable before timeout
            try:
                for (d, p) in valid_slots[i]:
                    if solver.Value(X[i, d, p]) == 1:
                        assigned_slot = (d, p)
                        break
            except Exception:
                pass

            # If not assigned by CP-SAT, pick first un-busy slot
            if assigned_slot is None:
                for (d, p) in valid_slots[i]:
                    if (t_id, d, p) not in used_t_slots and (c_id, d, p) not in used_c_slots:
                        assigned_slot = (d, p)
                        break

            # Fallback to any valid slot
            if assigned_slot is None and valid_slots[i]:
                assigned_slot = valid_slots[i][i % len(valid_slots[i])]

            if assigned_slot:
                temp_placed.append({
                    "allocationId": unit["alloc_id"],
                    "day": assigned_slot[0],
                    "period": assigned_slot[1]
                })
                used_t_slots.add((t_id, assigned_slot[0], assigned_slot[1]))
                used_c_slots.add((c_id, assigned_slot[0], assigned_slot[1]))

        placed_result = temp_placed

    return {
        "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        "placedLessons": placed_result
    }


# Handler for Vercel Serverless Function
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode("utf-8"))
            result = solve_cp_sat(data)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ERROR", "message": str(e)}).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


if __name__ == "__main__":
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            data = json.load(f)
        result = solve_cp_sat(data)
        print(json.dumps(result))
