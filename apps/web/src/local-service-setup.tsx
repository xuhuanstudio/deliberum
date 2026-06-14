import { StatusBanner } from "@deliberum/ui";
import { useI18n } from "./i18n";

const LOCAL_SERVICE_START_COMMAND =
  "corepack pnpm build && DELIBERUM_ENABLE_LOCAL_PRESET=true node apps/daemon/dist/index.js" as const;

export function LocalServiceSetupGuide({
  compact = false,
  onRetry
}: {
  compact?: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="du-local-service-guide" aria-label={t("Local service setup")}>
      <StatusBanner
        tone="warning"
        title={t("Start the local service")}
        detail={t(
          "Web cannot read setup or discussions until the local Deliberum service is running."
        )}
      />
      {compact ? (
        <p className="du-readable-meta">
          {t("Open Setup / Models for the local start command and model setup steps.")}
        </p>
      ) : (
        <div className="du-setup-step-list">
          <LocalServiceInstructionStep
            title={t("1. Start local service")}
            detail={t("Run this command from the repository on this machine.")}
          />
          <article className="du-readable-item">
            <h4>{t("Local service command")}</h4>
            <pre className="du-local-service-command">
              <code>{LOCAL_SERVICE_START_COMMAND}</code>
            </pre>
            <p>
              {t(
                "This starts the local service only; model API keys are added from Web after it connects."
              )}
            </p>
          </article>
          <LocalServiceInstructionStep
            title={t("2. Return to Web")}
            detail={t("Keep this page open, then use Check again after the service starts.")}
          />
          <LocalServiceInstructionStep
            title={t("3. Configure models in Web")}
            detail={t(
              "After the service responds, open Setup / Models to add the provider API key, base URL, and model."
            )}
          />
        </div>
      )}
      <div className="du-action-row">
        <button type="button" className="du-secondary-button" onClick={onRetry}>
          {t("Check again")}
        </button>
      </div>
      <p className="du-readable-meta">
        {t(
          "Advanced details keep diagnostics and low-level connection values out of the default setup path."
        )}
      </p>
    </section>
  );
}

function LocalServiceInstructionStep({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="du-readable-item">
      <h4>{title}</h4>
      <p>{detail}</p>
    </article>
  );
}
