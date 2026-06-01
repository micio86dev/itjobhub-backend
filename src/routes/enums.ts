import { Elysia, t } from "elysia";
import { getEnums } from "../domain/enums";
import { deriveLang } from "../i18n";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";

/**
 * Public, read-only taxonomy endpoint. Clients (dashboard + frontend) fetch the
 * canonical option lists here instead of hard-coding them, so Disponibilità /
 * Ruolo / Seniority / Modalità / Tipo di lavoro stay in sync everywhere.
 *
 * Labels are localized from the `Accept-Language` header (it/en/fr/es/de).
 */
export const enumsRoutes = new Elysia({ prefix: "/enums" }).get(
  "/",
  ({ request, set }) => {
    try {
      const { lang } = deriveLang({ request });
      return formatResponse(getEnums(lang), "Enums retrieved successfully");
    } catch (error) {
      set.status = 500;
      return formatError(`Failed to retrieve enums: ${getErrorMessage(error)}`, 500);
    }
  },
  {
    response: {
      200: t.Object({
        success: t.Boolean(),
        status: t.Number(),
        message: t.String(),
        data: t.Record(
          t.String(),
          t.Array(t.Object({ value: t.String(), label: t.String() })),
        ),
      }),
      500: t.Object({
        success: t.Boolean(),
        status: t.Number(),
        message: t.String(),
      }),
    },
    detail: {
      tags: ["enums"],
      description: "Canonical option lists for categorical fields, localized.",
    },
  },
);
