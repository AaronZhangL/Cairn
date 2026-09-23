/**
 * Every prompt the pipeline sends, as a shape both languages must fill.
 *
 * The prompts were Chinese because the first book was, and nothing ever said
 * what language to answer in — so the model followed the system prompt and a
 * Chinese book got Chinese slides by accident rather than by decision. An
 * English book got Chinese slides the same way, which is the bug.
 *
 * Each locale writes its own prompts rather than translating a template at
 * runtime: word order, the XML tag names, and the unit a length target is
 * stated in all differ, and a template with holes in it produces prompts that
 * read like a translation — which is exactly the register a model imitates.
 *
 * `en` is the source of the type, as it is for the interface dictionary, so a
 * field added there fails the typecheck until `zh` has it too.
 */
import type { BookType } from '../../types';
import type { BudgetId } from '../budget';

export interface ChapterBody {
  readonly idx: number;
  readonly title: string;
  readonly text: string;
}

export interface SlideRequest {
  readonly title: string;
  readonly brief: string;
  readonly keyPoints: readonly string[];
  readonly minutes: number;
  readonly slides: { readonly min: number; readonly max: number };
  readonly secondsPerSlide: number;
  readonly iconNames: readonly string[];
  /** Already rendered in this locale by `noteBlock`. */
  readonly material: string;
}

export interface ReduceRequest {
  readonly digest: string;
  readonly chapterCount: number;
  readonly budgetLabel: string;
  readonly minMinutes: number;
  readonly maxMinutes: number;
  readonly targetNodes: number;
  readonly minutesPerNode: readonly [number, number];
  readonly stageCount: number;
  /** A previous attempt overshot the budget and must be cut harder. */
  readonly tightening: boolean;
}

export interface RecapRequest {
  readonly bookTitle: string;
  readonly recapTitle: string;
  readonly walked: string;
  readonly stationCount: number;
  readonly minutes: number;
  readonly slides: { readonly min: number; readonly max: number };
}

export interface NoteMaterial {
  readonly idx: number;
  readonly title: string;
  readonly gist: string;
  readonly keyPoints: readonly string[];
  readonly quotes: readonly string[];
  readonly figures: readonly string[];
  readonly contrasts: readonly string[];
  readonly sequences: readonly string[];
  readonly relations: readonly string[];
}

export interface Prompts {
  readonly map: {
    readonly system: string;
    readonly user: (chapters: readonly ChapterBody[]) => string;
  };

  readonly classify: {
    readonly system: string;
    readonly user: (bookTitle: string, digest: string) => string;
  };

  readonly reduce: {
    readonly system: (type: BookType, coverage: string) => string;
    readonly user: (request: ReduceRequest) => string;
    /** How ruthless the selection should be, per rung. Prose, so it lives here. */
    readonly coverage: Readonly<Record<BudgetId, string>>;
    /** What the budget is called inside the prompt: a duration and a rung. */
    readonly budgetLabel: (minutes: number, budget: BudgetId) => string;
    /** Used when the model returns a stage with no name. Ends up in the path. */
    readonly fallbackStage: (n: number) => string;
  };

  readonly slides: {
    readonly system: string;
    readonly user: (request: SlideRequest) => string;
    /** One chapter's material, in this locale's section headings. */
    readonly noteBlock: (note: NoteMaterial) => string;
  };

  readonly recap: {
    readonly system: string;
    readonly user: (request: RecapRequest) => string;
    /** Written into the path, so they are read long after generation. */
    readonly stageTitle: string;
    readonly title: string;
    readonly brief: string;
  };

  /** Chapter titles invented during parsing, which end up in the path. */
  readonly parse: {
    readonly untitled: string;
    readonly opening: string;
    readonly part: (n: number) => string;
    readonly section: (n: number) => string;
    readonly whole: string;
  };
}
