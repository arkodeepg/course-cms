import { Section } from "@/types/course";

// Which of a module's sections start expanded on the module page, as positions
// in `sections` (not `section.index`, whose numbering depends on the indexer).
// Every section holding activity (a completed or in-progress lesson) opens;
// with no activity anywhere in the module, only its first section opens.
export function sectionsToOpen(
  sections: readonly Pick<Section, "lessons">[],
  hasActivity: (lessonFile: string) => boolean
): Set<number> {
  const open = new Set<number>();
  sections.forEach((s, pos) => {
    if (s.lessons.some((l) => hasActivity(l.file))) open.add(pos);
  });
  if (open.size === 0 && sections.length > 0) open.add(0);
  return open;
}
