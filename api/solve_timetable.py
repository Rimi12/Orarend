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

    # Filter out active allocations (non-traveling teachers)
    active_allocations = [
        a for a in allocations
        if not teacher_dict.get(a["teacherId"], {}).get("isTraveling", False)
    ]

    # Expand allocations into lesson units
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
    if num_lessons == 0:
        return {"status": "OPTIMAL", "placedLessons": preserved_lessons}

    DAYS = 5
    PERIODS = 8  # 0..7 (1. - 8. óra)

    # Decision variables X[i, d, p] -> Bool
    X = {}
    for i in range(num_lessons):
        for d in range(DAYS):
            for p in range(PERIODS):
                X[i, d, p] = model.NewBoolVar(f"x_{i}_{d}_{p}")

    # Constraint 1: Each lesson placed exactly once
    for i in range(num_lessons):
        model.AddExactlyOne(X[i, d, p] for d in range(DAYS) for p in range(PERIODS))

    # Constraint 2: Teacher Availability
    for i, unit in enumerate(lesson_units):
        t = teacher_dict.get(unit["teacher_id"])
        if t and "availability" in t:
            avail = t["availability"]
            for d in range(DAYS):
                for p in range(PERIODS):
                    if d < len(avail) and p < len(avail[d]) and avail[d][p] is False:
                        model.Add(X[i, d, p] == 0)

    # Constraint 3: Teacher collision (same teacher at same d,p cannot be in different classes)
    teacher_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        t_id = unit["teacher_id"]
        if t_id not in teacher_to_lessons:
            teacher_to_lessons[t_id] = []
        teacher_to_lessons[t_id].append(i)

    for t_id, indices in teacher_to_lessons.items():
        for d in range(DAYS):
            for p in range(PERIODS):
                # If they share the exact same classId (EGYMI merged class exception), allowed
                # Group by class_id
                class_groups = {}
                for idx in indices:
                    cid = lesson_units[idx]["class_id"]
                    if cid not in class_groups:
                        class_groups[cid] = []
                    class_groups[cid].append(idx)

                # Teacher can teach at most 1 different class at (d,p)
                class_active_vars = []
                for cid, c_indices in class_groups.items():
                    c_active = model.NewBoolVar(f"t_class_active_{t_id}_{cid}_{d}_{p}")
                    model.Add(sum(X[idx, d, p] for idx in c_indices) >= 1).OnlyEnforceIf(c_active)
                    model.Add(sum(X[idx, d, p] for idx in c_indices) == 0).OnlyEnforceIf(c_active.Not())
                    class_active_vars.append(c_active)

                model.Add(sum(class_active_vars) <= 1)

    # Constraint 4: Class & Group Collisions with Habilitáció Exceptions
    class_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        c_id = unit["class_id"]
        if c_id not in class_to_lessons:
            class_to_lessons[c_id] = []
        class_to_lessons[c_id].append(i)

    for c_id, indices in class_to_lessons.items():
        for d in range(DAYS):
            for p in range(PERIODS):
                # Standard class collision: max 1 lesson for whole-class, or 1 per distinct group
                # Group by group_name
                group_map = {}
                for idx in indices:
                    g_name = lesson_units[idx]["group_name"]
                    if g_name not in group_map:
                        group_map[g_name] = []
                    group_map[g_name].append(idx)

                # If whole-class lesson (g_name == "") active, no other lesson can be active unless exception
                has_whole = "" in group_map
                if has_whole:
                    whole_indices = group_map[""]
                    for idx_w in whole_indices:
                        for idx_other in indices:
                            if idx_w == idx_other:
                                continue

                            s_w = lesson_units[idx_w]["subject_name"].lower()
                            s_o = lesson_units[idx_other]["subject_name"].lower()
                            t_w = lesson_units[idx_w]["teacher_id"]
                            t_o = lesson_units[idx_other]["teacher_id"]
                            c_name = lesson_units[idx_w]["class_name"]

                            is_hab_w = "habilitáció" in s_w or "rehabilitáció" in s_w
                            is_hab_o = "habilitáció" in s_o or "rehabilitáció" in s_o
                            is_nap_w = "napközi" in s_w or "tanulószoba" in s_w or "szabadidő" in s_w
                            is_nap_o = "napközi" in s_o or "tanulószoba" in s_o or "szabadidő" in s_o
                            is_tesi_w = "testnevelés" in s_w or "tesi" in s_w
                            is_tesi_o = "testnevelés" in s_o or "tesi" in s_o
                            is_9_10 = "9." in c_name or "10." in c_name

                            # Exception: Habilitáció + Napközi by DIFFERENT teachers
                            allow_nap_hab = (is_hab_w and is_nap_o and t_w != t_o) or (is_hab_o and is_nap_w and t_w != t_o)
                            # Exception: Habilitáció + Tesi in 9-10. grade by DIFFERENT teachers
                            allow_tesi_hab = is_9_10 and ((is_hab_w and is_tesi_o and t_w != t_o) or (is_hab_o and is_tesi_w and t_w != t_o))

                            if not (allow_nap_hab or allow_tesi_hab):
                                model.Add(X[idx_w, d, p] + X[idx_other, d, p] <= 1)

    # Constraint 5: Academic lessons 1-7 period bound (period p <= 6)
    for i, unit in enumerate(lesson_units):
        s_name = unit["subject_name"].lower()
        is_napközi = "napközi" in s_name or "tanulószoba" in s_name or "szabadidő" in s_name
        is_habilitáció = "habilitáció" in s_name or "rehabilitáció" in s_name

        if not is_napközi and not is_habilitáció:
          model.Add(X[i, d, 7] == 0 for d in range(DAYS))

    # Constraint 6: Napközi must follow academic lessons without gap on same day
    for c_id, indices in class_to_lessons.items():
        napközi_indices = [idx for idx in indices if "napközi" in lesson_units[idx]["subject_name"].lower() or "tanulószoba" in lesson_units[idx]["subject_name"].lower()]
        academic_indices = [idx for idx in indices if idx not in napközi_indices and "habilitáció" not in lesson_units[idx]["subject_name"].lower()]

        for d in range(DAYS):
            for idx_nap in napközi_indices:
                for idx_acad in academic_indices:
                    for p_nap in range(PERIODS):
                        for p_acad in range(PERIODS):
                            if p_acad > p_nap:
                                # Academic lesson cannot be after Napközi on same day
                                model.AddBoolOr([X[idx_nap, d, p_nap].Not(), X[idx_acad, d, p_acad].Not()])

    # Constraint 7: Swimming exceptions (3. osztály Wed 1-2, 5. osztály Fri 1-2)
    for c_id, indices in class_to_lessons.items():
        c_name = class_dict.get(c_id, {}).get("name", "")
        pe_indices = [idx for idx in indices if "testnevelés" in lesson_units[idx]["subject_name"].lower() or "tesi" in lesson_units[idx]["subject_name"].lower()]

        if "3." in c_name and len(pe_indices) >= 2:
            # Wed (d=2), period 0 and 1
            model.Add(sum(X[pe_indices[0], 2, 0] + X[pe_indices[1], 2, 1] for _ in [0]) >= 1)
        elif "5." in c_name and len(pe_indices) >= 2:
            # Fri (d=4), period 0 and 1
            model.Add(sum(X[pe_indices[0], 4, 0] + X[pe_indices[1], 4, 1] for _ in [0]) >= 1)

    # Solve model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 8.0
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        placed_lessons = list(preserved_lessons)
        for i, unit in enumerate(lesson_units):
            for d in range(DAYS):
                for p in range(PERIODS):
                    if solver.Value(X[i, d, p]) == 1:
                        placed_lessons.append({
                            "allocationId": unit["alloc_id"],
                            "day": d,
                            "period": p,
                        })
        return {"status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE", "placedLessons": placed_lessons}
    else:
        return {"status": "INFEASIBLE", "message": "No valid timetable solution found for the given rules"}


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


# Standalone CLI execution for local dev server middleware
if __name__ == "__main__":
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            data = json.load(f)
        result = solve_cp_sat(data)
        print(json.dumps(result))
