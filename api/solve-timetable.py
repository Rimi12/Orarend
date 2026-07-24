import json
import sys
import os
from http.server import BaseHTTPRequestHandler

try:
    from ortools.sat.python import cp_model
    HAS_OR_TOOLS = True
except ImportError:
    HAS_OR_TOOLS = False


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

    for p_les in preserved_lessons:
        alloc_id = p_les.get("allocationId")
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

        slots = []
        for d in range(DAYS):
            for p in range(PERIODS):
                # 1. Teacher availability check
                if d < len(avail) and p < len(avail[d]) and avail[d][p] is False:
                    continue
                # 2. Teacher busy from preserved lesson check
                if (t_id, d, p) in teacher_busy_slots:
                    continue
                # 3. Class busy from preserved whole-class lesson check
                if (c_id, d, p) in class_whole_busy_slots:
                    # Exception: Habilitacio + Napkozi by different teachers
                    if is_hab and p in class_day_napkozi_periods.get((c_id, d), []):
                        pass  # allowed
                    else:
                        continue
                # 4. If whole class lesson, check if class has ANY preserved group lesson at (d,p)
                if is_whole:
                    # Check if class has whole-class or group preserved lesson
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

        whole_class_indices = []
        for idx in indices:
            g_name = lesson_units[idx]["group_name"].strip().lower()
            if not g_name or "közös" in g_name or "egész" in g_name or g_name == "0":
                whole_class_indices.append(idx)

        # Build conflict pairs for whole class vs others
        conflict_pairs = []
        for idx_w in whole_class_indices:
            s_w = lesson_units[idx_w]["subject_name"].lower()
            t_w = lesson_units[idx_w]["teacher_id"]
            is_hab_w = "habilitáció" in s_w or "rehabilitáció" in s_w
            is_nap_w = "napközi" in s_w or "tanulószoba" in s_w or "szabadidő" in s_w
            is_tesi_w = "testnevelés" in s_w or "tesi" in s_w

            for idx_other in indices:
                if idx_w >= idx_other:
                    continue
                s_o = lesson_units[idx_other]["subject_name"].lower()
                t_o = lesson_units[idx_other]["teacher_id"]
                is_hab_o = "habilitáció" in s_o or "rehabilitáció" in s_o
                is_nap_o = "napközi" in s_o or "tanulószoba" in s_o or "szabadidő" in s_o
                is_tesi_o = "testnevelés" in s_o or "tesi" in s_o

                allow_nap_hab = (is_hab_w and is_nap_o and t_w != t_o) or (is_hab_o and is_nap_w and t_w != t_o)
                allow_tesi_hab = is_9_10 and ((is_hab_w and is_tesi_o and t_w != t_o) or (is_hab_o and is_tesi_w and t_w != t_o))

                if not (allow_nap_hab or allow_tesi_hab):
                    conflict_pairs.append((idx_w, idx_other))

        # At most 1 whole-class lesson per slot
        if len(whole_class_indices) > 1:
            for d in range(DAYS):
                for p in range(PERIODS):
                    slot_vars = [X[idx, d, p] for idx in whole_class_indices if (d, p) in valid_slots[idx]]
                    if len(slot_vars) > 1:
                        model.Add(sum(slot_vars) <= 1)

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

    # Soft 2: Academic Lesson After Napközi on Same Day
    for c_id, indices in class_to_lessons.items():
        napközi_indices = [idx for idx in indices if "napközi" in lesson_units[idx]["subject_name"].lower() or "tanulószoba" in lesson_units[idx]["subject_name"].lower()]
        academic_indices = [idx for idx in indices if idx not in napközi_indices and "habilitáció" not in lesson_units[idx]["subject_name"].lower()]

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

                    # Check against new Napközi
                    for idx_nap in napközi_indices:
                        for (d_nap, p_nap) in valid_slots[idx_nap]:
                            if d_nap != d:
                                continue
                            if p_acad >= p_nap:
                                bad = model.NewBoolVar(f"bad_ord_{idx_nap}_{idx_acad}_{d}_{p_nap}_{p_acad}")
                                model.AddBoolAnd([X[idx_nap, d, p_nap], X[idx_acad, d, p_acad]]).OnlyEnforceIf(bad)
                                penalties.append(bad * 10000)

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

            if len(new_pe_vars) > 0:
                day_pe_total = model.NewIntVar(0, 8, f"pe_tot_{c_id}_{d}")
                model.Add(day_pe_total == sum(new_pe_vars) + prev_pe)

                diff = model.NewIntVar(-8, 8, f"pe_diff_{c_id}_{d}")
                model.Add(diff == day_pe_total - target_pe)

                abs_diff = model.NewIntVar(0, 8, f"pe_abs_{c_id}_{d}")
                model.AddAbsEquality(abs_diff, diff)

                penalties.append(abs_diff * 3000)

    # Minimize total penalties
    if penalties:
        model.Minimize(sum(penalties))

    # Greedy hint for warm start
    used_teacher_slots = set(teacher_busy_slots)
    used_class_slots = set(class_whole_busy_slots)
    for i, unit in enumerate(lesson_units):
        t_id = unit["teacher_id"]
        c_id = unit["class_id"]
        assigned = None
        for (d, p) in valid_slots[i]:
            if (t_id, d, p) not in used_teacher_slots and (c_id, d, p) not in used_class_slots:
                assigned = (d, p)
                break
        if assigned is None and valid_slots[i]:
            assigned = valid_slots[i][0]

        for (d, p) in valid_slots[i]:
            if (d, p) == assigned:
                model.AddHint(X[i, d, p], 1)
                if assigned:
                    used_teacher_slots.add((t_id, assigned[0], assigned[1]))
                    used_class_slots.add((c_id, assigned[0], assigned[1]))
            else:
                model.AddHint(X[i, d, p], 0)

    # Solve model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20.0
    solver.parameters.num_search_workers = 4
    solver.parameters.log_search_progress = False
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placed_lessons = list(preserved_lessons)
        for i, unit in enumerate(lesson_units):
            for (d, p) in valid_slots[i]:
                if solver.Value(X[i, d, p]) == 1:
                    placed_lessons.append({
                        "allocationId": unit["alloc_id"],
                        "day": d,
                        "period": p,
                    })
        return {"status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE", "placedLessons": placed_lessons}
    else:
        status_name = {cp_model.INFEASIBLE: 'INFEASIBLE', cp_model.UNKNOWN: 'UNKNOWN', cp_model.MODEL_INVALID: 'MODEL_INVALID'}.get(status, f'STATUS_{status}')
        return {"status": "INFEASIBLE", "message": f"CP-SAT solver status: {status_name}. Kérlek ellenőrizd a tanári elérhetőségeket és az óraszámokat!"}


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
