import { Elysia, t } from "elysia";
import logger from "../utils/logger";

export const imageProxyController = new Elysia({ prefix: "/image-proxy" })
    .get("/", async ({ query, set }) => {
        const { url } = query;

        if (!url) {
            set.status = 400;
            return { success: false, error: "Missing url parameter" };
        }

        try {
            // Validate URL
            const targetUrl = new URL(url);

            // Security check: mitigate SSRF by allowing only http/https
            if (!['http:', 'https:'].includes(targetUrl.protocol)) {
                set.status = 400;
                return { success: false, error: "Invalid protocol" };
            }

            const response = await fetch(url.toString(), {
                headers: {
                    "User-Agent": "DevBoards-ImageProxy/1.0"
                }
            });

            if (!response.ok) {
                set.status = response.status;
                return { success: false, error: "Failed to fetch image" };
            }

            const contentType = response.headers.get("content-type");
            if (contentType) {
                set.headers["Content-Type"] = contentType;
            }

            // Aggressive caching: 1 year
            set.headers["Cache-Control"] = "public, max-age=31536000, immutable";

            // Stream the response
            return response.blob();
        } catch (error) {
            logger.error({ error, url }, "Image proxy error");
            set.status = 500;
            return { success: false, error: "Internal server error" };
        }
    }, {
        query: t.Object({
            url: t.String()
        })
    });
