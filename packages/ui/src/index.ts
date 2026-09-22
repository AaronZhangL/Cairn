export { SlideView, type SlideChrome } from './slides/SlideView';
export { Icon } from './slides/Icon';
export { PlayMark, PauseMark, FastMark } from './panes/icons';
export { StagePane } from './panes/StagePane';
export { DeckPane } from './panes/DeckPane';
export { AskPane, type Turn } from './panes/AskPane';
export { useTransport, RATES, type Transport } from './panes/useTransport';
export { useSplit, type Split } from './panes/useSplit';
export { useResume, type Resume } from './panes/useResume';
export {
  EMPTY_RESUME, closeBook, openBook, placeIn, remember, shouldWrite, startAt,
  parseStored as parseStoredResume,
  type Place, type ResumeStore,
} from './panes/resume';
export { Splitter } from './panes/Splitter';
export { PanelToggle, type PanelControl } from './panes/PanelToggle';
export { BookMenu } from './panes/BookMenu';
export {
  applyDrag, columnWidth, toggle, parseStored,
  LEFT_LIMITS, RIGHT_LIMITS, DEFAULT_LEFT, DEFAULT_RIGHT, RAIL,
  type SplitLimits, type SplitState,
} from './panes/split';
import './app.css';
