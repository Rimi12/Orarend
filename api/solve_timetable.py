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

    # Constraint 3: Strict Teacher Collision (No teacher can teach 2 lessons at the same time!)
    teacher_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        t_id = unit["teacher_id"]
        if t_id not in teacher_to_lessons:
            teacher_to_lessons[t_id] = []
        teacher_to_lessons[t_id].append(i)

    for t_id, indices in teacher_to_lessons.items():
        for d in range(DAYS):
            for p in range(PERIODS):
                model.Add(sum(X[idx, d, p] for idx in indices) <= 1)

    # Constraint 4: Class & Group Collisions with Habilitáció Exceptions
    class_to_lessons = {}
    for i, unit in enumerate(lesson_units):
        c_id = unit["class_id"]
        if c_id not in class_to_lessons:
            class_to_lessons[c_id] = []
        class_to_lessons[c_id].append(i)

    for c_id, indices in class_to_lessons.items():
        c_name = class_dict.get(c_id, {}).get("name", "").lower()
        for d in range(DAYS):
            for p in range(PERIODS):
                # Identify whole-class lessons vs group-bontott lessons
                # Any group string like "", " (közös óra)", "egész osztály", etc. is whole-class
                whole_class_indices = []
                subgroup_map = {}

                for idx in indices:
                    g_name = lesson_units[idx]["group_name"].strip().lower()
                    if not g_name or "közös" in g_name or "egész" in g_name or g_name == "0":
                        whole_class_indices.append(idx)
                    else:
                        if g_name not in subgroup_map:
                            subgroup_map[g_name] = []
                        subgroup_map[g_name].append(idx)

                # At most 1 whole-class lesson per (d, p) slot for class c
                if len(whole_class_indices) > 1:
                    model.Add(sum(X[idx, d, p] for idx in whole_class_indices) <= 1)

                # If whole-class lesson active, no other lesson allowed unless allowed exception
                for idx_w in whole_class_indices:
                    for idx_other in indices:
                        if idx_w == idx_other:
                            continue

                        s_w = lesson_units[idx_w]["subject_name"].lower()
                        s_o = lesson_units[idx_other]["subject_name"].lower()
                        t_w = lesson_units[idx_w]["teacher_id"]
                        t_o = lesson_units[idx_other]["teacher_id"]

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

    # Constraint 5: Subject-specific time windows based on Grade Level
    for i, unit in enumerate(lesson_units):
        s_name = unit["subject_name"].lower()
        c_name = unit["class_name"].lower()
        is_napközi = "napközi" in s_name or "tanulószoba" in s_name or "szabadidő" in s_name
        is_habilitáció = "habilitáció" in s_name or "rehabilitáció" in s_name

        is_7_8 = "7." in c_name or "8." in c_name
        is_4 = "4." in c_name

        if is_7_8:
            # 7-8. osztály (30h/week = 6 academic h/day -> 1-6. óra academic, 7-8. óra Napközi/Hab)
            if is_napközi or is_habilitáció:
                for d in range(DAYS):
                    for p in range(6): # 0..5 (1-6. óra) forbidden for Napközi/Hab in 7-8. grade
                        model.Add(X[i, d, p] == 0)
            else:
                for d in range(DAYS):
                    model.Add(X[i, d, 6] == 0) # 7. óra forbidden for academic in 7-8. grade
                    model.Add(X[i, d, 7] == 0) # 8. óra forbidden for academic in 7-8. grade
        elif is_4:
            # 4. osztály (25h/week = 5 academic h/day -> 1-5. óra academic, 6-8. óra Napközi/Hab)
            if is_napközi or is_habilitáció:
                for d in range(DAYS):
                    for p in range(5): # 0..4 forbidden
                        model.Add(X[i, d, p] == 0)
            else:
                for d in range(DAYS):
                    model.Add(X[i, d, 5] == 0)
                    model.Add(X[i, d, 6] == 0)
                    model.Add(X[i, d, 7] == 0)
        else:
            # Standard grades (1-3, 5-6, 9E): Napközi/Hab >= 5th period (p>=4)
            if is_napközi or is_habilitáció:
                for d in range(DAYS):
                    for p in range(4):
                        model.Add(X[i, d, p] == 0)
            else:
                for d in range(DAYS):
                    model.Add(X[i, d, 7] == 0)

    # Constraint 6: Absolute prohibition of academic lessons during or after Napközi on same day
    for c_id, indices in class_to_lessons.items():
        napközi_indices = [idx for idx in indices if "napközi" in lesson_units[idx]["subject_name"].lower() or "tanulószoba" in lesson_units[idx]["subject_name"].lower()]
        academic_indices = [idx for idx in indices if idx not in napközi_indices and "habilitáció" not in lesson_units[idx]["subject_name"].lower()]

        for d in range(DAYS):
            for idx_nap in napközi_indices:
                for idx_acad in academic_indices:
                    for p_nap in range(PERIODS):
                        for p_acad in range(p_nap, PERIODS):
                            # Academic lesson cannot be at or after Napközi on same day
                            model.AddBoolOr([X[idx_nap, d, p_nap].Not(), X[idx_acad, d, p_acad].Not()])

    # Constraint 7: Swimming exceptions (3. osztály Wed 1-2, 5. osztály Fri 1-2)
    for c_id, indices in class_to_lessons.items():
        c_name = class_dict.get(c_id, {}).get("name", "").lower()
        pe_indices = [idx for idx in indices if "testnevelés" in lesson_units[idx]["subject_name"].lower() or "tesi" in lesson_units[idx]["subject_name"].lower()]

        is_grade_3 = "3." in c_name or "3/a" in c_name or "3/b" in c_name or c_name.startswith("3 ") or c_name == "3"
        is_grade_5 = "5." in c_name or "5/a" in c_name or "5/b" in c_name or c_name.startswith("5 ") or c_name == "5"

        if is_grade_3 and len(pe_indices) >= 2:
            # Wednesday (d=2): period 0 (1. óra) MUST be PE, AND period 1 (2. óra) MUST be PE
            model.Add(sum(X[idx, 2, 0] for idx in pe_indices) == 1)
            model.Add(sum(X[idx, 2, 1] for idx in pe_indices) == 1)

        if is_grade_5 and len(pe_indices) >= 2:
            # Friday (d=4): period 0 (1. óra) MUST be PE, AND period 1 (2. óra) MUST be PE
            model.Add(sum(X[idx, 4, 0] for idx in pe_indices) == 1)
            model.Add(sum(X[idx, 4, 1] for idx in pe_indices) == 1)

    # Constraint 8: Painter practice blocks (9. festő & 10. festő)
    for c_id, indices in class_to_lessons.items():
        c_name = class_dict.get(c_id, {}).get("name", "").lower()
        if "festő" in c_name or "festo" in c_name:
            practice_indices = [idx for idx in indices if "gyakorlat" in lesson_units[idx]["subject_name"].lower() or "szakmai" in lesson_units[idx]["subject_name"].lower()]
            if len(practice_indices) > 0:
                # For each day d, create a boolean indicating if practice is active on day d
                day_active = [model.NewBoolVar(f"practice_day_{c_id}_{d}") for d in range(DAYS)]
                for d in range(DAYS):
                    model.Add(sum(X[idx, d, p] for idx in practice_indices for p in range(PERIODS)) >= 1).OnlyEnforceIf(day_active[d])
                    model.Add(sum(X[idx, d, p] for idx in practice_indices for p in range(PERIODS)) == 0).OnlyEnforceIf(day_active[d].Not())
                
                # Practice days must be exactly 2 consecutive days
                model.Add(sum(day_active) == 2)
                # Consecutive condition: day_active[d] and day_active[d+1]
                consecutive_pairs = []
                for d in range(DAYS - 1):
                    pair = model.NewBoolVar(f"pair_{c_id}_{d}")
                    model.AddBoolAnd([day_active[d], day_active[d+1]]).OnlyEnforceIf(pair)
                    model.AddBoolOr([day_active[d].Not(), day_active[d+1].Not()]).OnlyEnforceIf(pair.Not())
                    consecutive_pairs.append(pair)
                model.Add(sum(consecutive_pairs) == 1)

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
