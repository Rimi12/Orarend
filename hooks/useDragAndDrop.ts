import React, { useState, useCallback } from 'react';
import { Allocation, TimetableCellData, ParallelLessonConfirmation } from '../types.ts';
import { DragType } from '../types.ts';
import { useTimetable } from '../contexts/TimetableContext.tsx';

export const useDragAndDrop = () => {
  const { 
    currentState, getUnplacedLessonsForTeacher, checkCollision, addLesson 
  } = useTimetable();
  
  const [draggedAllocation, setDraggedAllocation] = useState<Allocation | null>(null);
  const [parallelConfirmation, setParallelConfirmation] = useState<ParallelLessonConfirmation | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if(target.getAttribute('draggable') === 'true') {
        const lessonData = e.dataTransfer.getData(DragType.LESSON);
        if(lessonData) {
            try {
                setDraggedAllocation(JSON.parse(lessonData));
            } catch(err) {
                console.error("Failed to parse dragged data", err);
                setDraggedAllocation(null);
            }
        }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedAllocation(null);
  }, []);

  const handleGlobalDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggedAllocation) return;

    const { clientY } = e;
    const viewportHeight = window.innerHeight;
    const scrollThreshold = 75; // px from edge
    const scrollSpeed = 15; // scroll speed

    if (clientY < scrollThreshold) {
        window.scrollBy(0, -scrollSpeed);
    } else if (clientY > viewportHeight - scrollThreshold) {
        window.scrollBy(0, scrollSpeed);
    }
  }, [draggedAllocation]);

  const handleDrop = useCallback((allocation: Allocation, cell: TimetableCellData) => {
    const unplaced = getUnplacedLessonsForTeacher(allocation.teacherId)?.find(l => l.allocation.id === allocation.id);
    if (!unplaced || unplaced.remainingHours <= 0) {
        alert("A tantárgy heti óraszáma betelt.");
        return;
    }

    const collision = checkCollision(allocation, cell);

    if (collision.availability) {
        alert("A tanár ebben az időpontban nem elérhető.");
        return;
    }

    if (collision.teacher || collision.class) {
        const allLessonsInCell = currentState?.placedLessons.filter(p => p.day === cell.day && p.period === cell.period) || [];
        const relevantExistingLessons = allLessonsInCell.filter(p =>
            p.allocation.teacherId === allocation.teacherId ||
            p.allocation.classId === allocation.classId
        );
        setParallelConfirmation({ allocation, cell, collision, existingLessons: relevantExistingLessons });
        return;
    }
    
    addLesson(allocation, cell);
  }, [getUnplacedLessonsForTeacher, checkCollision, currentState?.placedLessons, addLesson]);

  const handleConfirmParallel = useCallback(() => {
    if (parallelConfirmation) {
        addLesson(parallelConfirmation.allocation, parallelConfirmation.cell);
    }
    setParallelConfirmation(null);
  }, [parallelConfirmation, addLesson]);
  
  const handleCancelParallel = useCallback(() => {
    setParallelConfirmation(null);
  }, []);

  return {
    draggedAllocation,
    parallelConfirmation,
    handleDragStart,
    handleDragEnd,
    handleGlobalDragOver,
    handleDrop,
    handleConfirmParallel,
    handleCancelParallel
  };
};
