import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT, type ShellSettings, type VoiceOption } from '@cairn/ui';
import {
  clearCache, dataDir, getSettings, inShell, modelStatus, previewVoice,
  revealDataDir, setSettings,
} from './bridge';
import {
  DEFAULT_SHELL_SETTINGS, VOICES,
  type ContentLocale, type ModelStatus, type ShellSettingsValues,
} from './shared/settings';

/**
 * The half of the settings panel that only the main process can answer.
 *
 * Returns nothing outside the desktop shell, which is what makes those pages
 * say "needs the desktop app" instead of rendering controls that quietly do
 * nothing — `bun run dev` has no process to store a key or speak a voice.
 *
 * Writes are optimistic: the panel is a list of switches, and a switch that
 * waits for a file to be written before it moves feels broken. The stored value
 * comes back from the write and replaces the guess.
 */
export function useShellSettings(): ShellSettings | undefined {
  const t = useT();
  const [values, setValues] = useState<ShellSettingsValues>();
  const [dir, setDir] = useState('');
  const [model, setModel] = useState<ModelStatus>();
  const [previewing, setPreviewing] = useState<ContentLocale>();

  /** One element reused for every audition, so two cannot overlap. */
  const audio = useRef<HTMLAudioElement | undefined>(undefined);

  useEffect(() => {
    if (!inShell) return;
    let live = true;
    void (async () => {
      const [stored, where, model] = await Promise.all([
        getSettings(), dataDir(), modelStatus(),
      ]);
      if (!live) return;
      setValues(stored ?? DEFAULT_SHELL_SETTINGS);
      setDir(where);
      setModel(model);
    })();
    return () => { live = false; };
  }, []);

  // Stopping playback when the panel closes is the element's own cleanup
  useEffect(() => () => audio.current?.pause(), []);

  const setPref = useCallback(<K extends keyof ShellSettingsValues>(
    key: K,
    value: ShellSettingsValues[K],
  ) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    void setSettings({ [key]: value } as Partial<ShellSettingsValues>)
      .then((stored) => {
        setValues(stored);
        // The model route is derived from these, so the panel's "in force" line
        // is stale the moment one of them changes.
        if (key === 'model') void modelStatus().then(setModel);
      })
      // A write that failed leaves the optimistic value on screen and the real
      // one on disk. Re-reading is the only way to stop lying about it.
      .catch(() => void getSettings().then((stored) => stored && setValues(stored)));
  }, []);

  const voicesFor = useCallback((locale: ContentLocale): readonly VoiceOption[] => (
    VOICES[locale].map((voice) => ({
      id: voice.id,
      // The name is a proper noun and stays put; what it is gets translated
      label: [
        voice.name,
        t.settings.narration.voiceGender[voice.gender],
        t.settings.narration.voiceStyle[voice.style],
      ].join(' · '),
    }))
  ), [t]);

  const audition = useCallback((locale: ContentLocale) => {
    const element = (audio.current ??= new Audio());
    if (previewing === locale) {
      element.pause();
      setPreviewing(undefined);
      return;
    }
    setPreviewing(locale);
    void previewVoice(locale)
      .then((src) => {
        element.src = src;
        element.onended = () => setPreviewing(undefined);
        return element.play();
      })
      // Synthesis can fail for the same reasons a book's can — no network, a
      // voice id this account cannot use. Silence is the signal.
      .catch(() => setPreviewing(undefined));
  }, [previewing]);

  const recheckModel = useCallback(() => {
    void modelStatus().then(setModel);
  }, []);

  return useMemo(() => {
    if (!inShell || !values) return undefined;
    return {
      prefs: values,
      setPref,
      voicesFor,
      recheckModel,
      ...(model ? { modelStatus: model } : {}),
      previewVoice: audition,
      previewing,
      dataDir: dir,
      revealDataDir: () => void revealDataDir(),
      clearCache,
    } satisfies ShellSettings;
  }, [values, setPref, voicesFor, recheckModel, model, audition, previewing, dir]);
}
