import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import type { Messages } from '../i18n/messages/en';
import { LOCALES, type Locale } from '../i18n/locale';
import { useUi } from './SettingsProvider';
import { TEXT_SIZES, THEMES, type TextSize, type ThemeChoice } from './prefs';
import {
  BUDGET_IDS, type ChatModelSettings, type ModelSettings, type NarrationLanguage, type SettingsBudgetId,
  type ShellSettings,
} from './shell';
import { Row, SecretField, Section, Segmented, Select, StackedRow, Switch } from './rows';

/** The rates the transport offers, as the panel's default-speed choices. */
const RATES = [0.75, 1, 1.25, 1.5, 2, 3] as const;

const LOCALE_LABEL: Readonly<Record<Locale, string>> = {
  en: 'English (US)',
  // Its own name in its own script: a language list nobody can read is useless
  zh: '简体中文',
};

export function GeneralPage(): ReactElement {
  const { prefs, setPref, t } = useUi();
  const languageId = useId();

  const themes: readonly { value: ThemeChoice; label: string }[] = [
    { value: 'light', label: t.settings.general.themeLight },
    { value: 'dark', label: t.settings.general.themeDark },
    { value: 'system', label: t.settings.general.themeSystem },
  ];

  return (
    <Section title={t.settings.pages.general}>
      <Row
        label={t.settings.general.language}
        hint={t.settings.general.languageHint}
        htmlFor={languageId}
      >
        <Select
          id={languageId}
          value={prefs.locale}
          choices={LOCALES.map((l) => ({ value: l, label: LOCALE_LABEL[l] }))}
          onPick={(value) => setPref('locale', value)}
        />
      </Row>

      <Row label={t.settings.general.theme}>
        <Segmented
          value={prefs.theme}
          choices={THEMES.map((value) => themes.find((x) => x.value === value)!)}
          onPick={(value) => setPref('theme', value)}
          label={t.settings.general.theme}
        />
      </Row>
    </Section>
  );
}

export function AppearancePage(): ReactElement {
  const { prefs, setPref, t } = useUi();

  const sizes: Readonly<Record<TextSize, string>> = {
    s: t.settings.appearance.sizeS,
    m: t.settings.appearance.sizeM,
    l: t.settings.appearance.sizeL,
    xl: t.settings.appearance.sizeXL,
  };

  return (
    <Section title={t.settings.pages.appearance}>
      <StackedRow
        label={t.settings.appearance.slideText}
        hint={t.settings.appearance.slideTextHint}
        aside={(
          <Segmented
            value={prefs.textSize}
            choices={TEXT_SIZES.map((value) => ({ value, label: sizes[value] }))}
            onPick={(value) => setPref('textSize', value)}
            label={t.settings.appearance.slideText}
          />
        )}
      >
        {/* The sample is the control's own feedback: a size picker with nothing
            to look at makes the reader close the panel to see what they did. */}
        <p className="set-sample">
          {t.settings.appearance.sample}
          <span className="set-sample-cue">{t.settings.appearance.sampleCue}</span>
        </p>
      </StackedRow>
    </Section>
  );
}

export function PlaybackPage(): ReactElement {
  const { prefs, setPref, t } = useUi();
  const rateId = useId();
  const autoId = useId();
  const resumeId = useId();

  return (
    <Section title={t.settings.pages.playback}>
      <Row label={t.settings.playback.rate} hint={t.settings.playback.rateHint} htmlFor={rateId}>
        <Select
          id={rateId}
          value={String(prefs.rate)}
          choices={RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
          onPick={(value) => setPref('rate', Number(value))}
        />
      </Row>

      <Row label={t.settings.playback.autoNext} hint={t.settings.playback.autoNextHint}>
        <Switch
          id={autoId}
          checked={prefs.autoNext}
          onChange={(next) => setPref('autoNext', next)}
          label={t.settings.playback.autoNext}
        />
      </Row>

      <Row label={t.settings.playback.resume} hint={t.settings.playback.resumeHint}>
        <Switch
          id={resumeId}
          checked={prefs.resume}
          onChange={(next) => setPref('resume', next)}
          label={t.settings.playback.resume}
        />
      </Row>
    </Section>
  );
}

/**
 * The rungs are fixed in intent — skim / gist / read / walk it all — so their
 * names are copy, not data from the pipeline. `budget.ts` keeps its own set for
 * the prompts it writes; those are instructions to a model, not words to read.
 */
function budgetLabel(id: SettingsBudgetId, t: Messages): string {
  return t.settings.narration.budgets[id];
}

export function ModelsPage({ shell }: { shell?: ShellSettings }): ReactElement {
  const { t } = useUi();
  const sourceId = useId();
  const keyId = useId();
  const urlId = useId();
  const nameId = useId();
  const chatSourceId = useId();
  const chatKeyId = useId();
  const chatNameId = useId();

  if (!shell) return <Offline title={t.settings.pages.models} />;

  const { model, chatModel } = shell.prefs;
  const set = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]): void =>
    shell.setPref('model', { ...model, [key]: value });
  const setChat = <K extends keyof ChatModelSettings>(key: K, value: ChatModelSettings[K]): void =>
    shell.setPref('chatModel', { ...chatModel, [key]: value });

  const status = shell.modelStatus;
  const statusText = status === undefined
    ? ''
    : status.ready
      ? t.settings.models.statusReady(status.provider, status.detail)
      : status.detail === 'no-api-key'
        ? t.settings.models.statusNoKey
        : t.settings.models.statusNoLogin;

  return (
    <Section title={t.settings.pages.models}>
      <Row
        label={t.settings.models.source}
        hint={model.source === 'codex' ? t.settings.models.codexHint : t.settings.models.keyHint}
        htmlFor={sourceId}
      >
        <Select
          id={sourceId}
          value={model.source}
          choices={[
            { value: 'codex' as const, label: t.settings.models.sourceCodex },
            { value: 'key' as const, label: t.settings.models.sourceKey },
          ]}
          onPick={(value) => set('source', value)}
        />
      </Row>

      {/* Only for the key route: the Codex route has no endpoint to choose and
          no key to type, which is the whole reason to offer it. */}
      {model.source === 'key' && (
        <StackedRow label={t.settings.models.apiKey} hint={t.settings.models.secretHint} htmlFor={keyId}>
          <SecretField
            id={keyId}
            value={model.apiKey}
            onChange={(value) => set('apiKey', value)}
            showLabel={t.settings.keys.showKey}
            hideLabel={t.settings.keys.hideKey}
          />
        </StackedRow>
      )}

      {model.source === 'key' && (
        <Row label={t.settings.models.baseUrl} htmlFor={urlId}>
          <input
            id={urlId}
            className="set-input plain"
            value={model.baseUrl}
            placeholder={t.settings.models.baseUrlPlaceholder}
            spellCheck={false}
            onChange={(e) => set('baseUrl', e.target.value)}
          />
        </Row>
      )}

      <Row label={t.settings.models.modelName} htmlFor={nameId}>
        <input
          id={nameId}
          className="set-input plain"
          value={model.model}
          placeholder={t.settings.models.modelPlaceholder}
          spellCheck={false}
          onChange={(e) => set('model', e.target.value)}
        />
      </Row>

      <Row
        label={t.settings.models.status}
        hint={(
          <span className={status?.ready ? 'set-hint ok' : 'set-hint warn'}>{statusText}</span>
        )}
      >
        <button type="button" className="set-btn" onClick={shell.recheckModel}>
          {t.settings.models.recheck}
        </button>
      </Row>
      <Row label={t.settings.models.chatSource} hint={t.settings.models.chatHint} htmlFor={chatSourceId}>
        <Select
          id={chatSourceId}
          value={chatModel.source}
          choices={[
            { value: 'inherit' as const, label: t.settings.models.chatInherit },
            { value: 'anthropic' as const, label: 'Anthropic' },
            { value: 'deepseek' as const, label: 'DeepSeek' },
            { value: 'minimax' as const, label: 'MiniMax' },
            { value: 'minimax-cn' as const, label: 'MiniMax CN' },
          ]}
          onPick={(value) => shell.setPref('chatModel', { source: value, apiKey: '', model: '' })}
        />
      </Row>
      {chatModel.source !== 'inherit' && (
        <StackedRow label={t.settings.models.chatApiKey} hint={t.settings.models.secretHint} htmlFor={chatKeyId}>
          <SecretField
            id={chatKeyId}
            value={chatModel.apiKey}
            onChange={(value) => setChat('apiKey', value)}
            showLabel={t.settings.keys.showKey}
            hideLabel={t.settings.keys.hideKey}
          />
        </StackedRow>
      )}
      {chatModel.source !== 'inherit' && (
        <Row label={t.settings.models.chatModelName} htmlFor={chatNameId}>
          <input
            id={chatNameId}
            className="set-input plain"
            value={chatModel.model}
            placeholder={t.settings.models.chatModelPlaceholder}
            spellCheck={false}
            onChange={(e) => setChat('model', e.target.value)}
          />
        </Row>
      )}
    </Section>
  );
}

export function NarrationPage({ shell }: { shell?: ShellSettings }): ReactElement {
  const { t } = useUi();
  const languageId = useId();
  const budgetId = useId();

  if (!shell) return <Offline title={t.settings.pages.narration} />;

  const languages: readonly { value: NarrationLanguage; label: string }[] = [
    { value: 'follow', label: t.settings.narration.followBook },
    { value: 'en', label: t.settings.narration.alwaysEn },
    { value: 'zh', label: t.settings.narration.alwaysZh },
  ];

  return (
    <>
      <Section title={t.settings.pages.narration}>
        <Row
          label={t.settings.narration.language}
          hint={t.settings.narration.languageHint}
          htmlFor={languageId}
        >
          <Select
            id={languageId}
            value={shell.prefs.narration}
            choices={languages}
            onPick={(value) => shell.setPref('narration', value)}
          />
        </Row>

        {/* Both voices are always shown: with "follow the book" chosen, which
            one a given book uses is decided by the book, not here. */}
        <VoiceRow shell={shell} locale="en" />
        <VoiceRow shell={shell} locale="zh" />

        <Row
          label={t.settings.narration.engine}
          hint={(
            <span className={shell.engine.found ? 'set-hint ok' : 'set-hint warn'}>
              {shell.engine.found
                ? t.settings.narration.engineFound(shell.engine.path ?? '')
                : t.settings.narration.engineMissing}
            </span>
          )}
        >
          <button type="button" className="set-btn" onClick={shell.recheckEngine}>
            {t.settings.narration.recheck}
          </button>
        </Row>
      </Section>

      <Section title={t.settings.narration.budget}>
        <Row label={t.settings.narration.budget} hint={t.settings.narration.budgetHint} htmlFor={budgetId}>
          <Select
            id={budgetId}
            value={shell.prefs.defaultBudget}
            choices={BUDGET_IDS.map((id) => ({ value: id, label: budgetLabel(id, t) }))}
            onPick={(value) => shell.setPref('defaultBudget', value)}
          />
        </Row>
      </Section>
    </>
  );
}

function VoiceRow({ shell, locale }: { shell: ShellSettings; locale: Locale }): ReactElement {
  const { t } = useUi();
  const id = useId();
  const options = shell.voicesFor(locale);
  const playing = shell.previewing === locale;

  return (
    <Row
      label={locale === 'en' ? t.settings.narration.voiceEn : t.settings.narration.voiceZh}
      hint={locale === 'en' ? t.settings.narration.voiceEnHint : t.settings.narration.voiceZhHint}
      htmlFor={id}
    >
      <span className="set-voice">
        <Select
          id={id}
          value={shell.prefs.voices[locale]}
          choices={options.map((v) => ({ value: v.id, label: v.label }))}
          onPick={(value) => shell.setPref('voices', { ...shell.prefs.voices, [locale]: value })}
        />
        <button
          type="button"
          className={playing ? 'set-btn busy' : 'set-btn'}
          // A voice cannot be heard without the binary that speaks it
          disabled={!shell.engine.found}
          onClick={() => shell.previewVoice(locale)}
        >
          {playing ? t.settings.narration.stop : t.settings.narration.preview}
        </button>
      </span>
    </Row>
  );
}

export function KeysPage({ shell }: { shell?: ShellSettings }): ReactElement {
  const { t } = useUi();
  const keyId = useId();
  const traceId = useId();

  if (!shell) return <Offline title={t.settings.pages.keys} />;

  return (
    <Section title={t.settings.pages.keys}>
      <StackedRow
        label={t.settings.keys.tavily}
        hint={<>{t.settings.keys.tavilyHint} {t.settings.models.secretHint}</>}
        htmlFor={keyId}
        aside={(
          <a
            className="set-link"
            href="https://app.tavily.com/home"
            target="_blank"
            rel="noreferrer"
          >
            {t.settings.keys.getKey}
          </a>
        )}
      >
        <SecretField
          id={keyId}
          value={shell.prefs.tavilyKey}
          onChange={(value) => shell.setPref('tavilyKey', value)}
          showLabel={t.settings.keys.showKey}
          hideLabel={t.settings.keys.hideKey}
        />
      </StackedRow>

      <Row label={t.settings.keys.trace} hint={<span className="set-hint warn">{t.settings.keys.traceHint}</span>}>
        <Switch
          id={traceId}
          checked={shell.prefs.trace}
          onChange={(next) => shell.setPref('trace', next)}
          label={t.settings.keys.trace}
        />
      </Row>
    </Section>
  );
}

export function DataPage({ shell }: { shell?: ShellSettings }): ReactElement {
  const { t } = useUi();
  /** Irreversible and one click away, so it takes two — as deleting a book does. */
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!shell) return <Offline title={t.settings.pages.data} />;

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await shell.clearCache();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t.settings.pages.data}>
      <Row
        label={t.settings.data.location}
        hint={<code className="set-path">{shell.dataDir}</code>}
      >
        <button type="button" className="set-btn" onClick={shell.revealDataDir}>
          {t.settings.data.reveal}
        </button>
      </Row>

      <Row label={t.settings.data.cache} hint={t.settings.data.cacheHint}>
        {confirming ? (
          <span className="set-confirm">
            <span className="set-hint">{t.settings.data.confirm}</span>
            <button type="button" className="set-btn danger" disabled={busy} onClick={() => void clear()}>
              {busy ? t.settings.data.clearing : t.settings.data.confirmYes}
            </button>
            <button type="button" className="set-btn" disabled={busy} onClick={() => setConfirming(false)}>
              {t.settings.data.confirmNo}
            </button>
          </span>
        ) : (
          <button type="button" className="set-btn danger" onClick={() => setConfirming(true)}>
            {t.settings.data.clear}
          </button>
        )}
      </Row>
    </Section>
  );
}

/** What a page shows when there is no main process behind it (`bun run dev`). */
function Offline({ title }: { title: string }): ReactElement {
  const { t } = useUi();
  return (
    <Section title={title}>
      <div className="set-row">
        <span className="set-hint">{t.settings.offline}</span>
      </div>
    </Section>
  );
}
