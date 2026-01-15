import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { helmet } from "elysia-helmet";
import { rateLimit } from "elysia-rate-limit";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { jobRoutes } from "./routes/jobs";
import { companyRoutes } from "./routes/companies";
import { commentRoutes } from "./routes/comments";
import { likeRoutes } from "./routes/likes";
import { adminRoutes } from "./routes/admin";
import { favoritesRoutes } from "./routes/favorites";
import { authMiddleware } from "./middleware/auth";
import { deriveLang, translate } from "./i18n";

// Custom key generator to extract IP from request
const ipKeyGenerator = (req: Request): string => {
    // Try to get IP from various proxy headers
    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, get the first one
        return forwardedFor.split(",")[0].trim();
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    const forwarded = req.headers.get("forwarded");
    if (forwarded) {
        // Parse forwarded header (e.g., "for=192.0.2.60;proto=http;by=203.0.113.43")
        const match = forwarded.match(/for=([^;]+)/);
        if (match) {
            return match[1].trim();
        }
    }

    // Fallback to a default key if no IP can be determined
    return "unknown-ip";
};

// Create Elysia app with plugins
export const app = new Elysia()
    .use(
        cors({
            origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
            allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            credentials: true,
            preflight: true
        })
    )
    .use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // Allow inline scripts and scripts from cdn.jsdelivr.net
                },
            },
        })
    )
    .use(
        rateLimit({
            max: 100,
            duration: 60000,
            generator: ipKeyGenerator,
        })
    )
    .derive(deriveLang)
    .use(
        swagger({
            documentation: {
                info: {
                    title: "IT Job Hub API",
                    version: "1.0.0",
                    description: "API for IT Job Hub platform",
                },
                tags: [
                    { name: "auth", description: "Authentication endpoints" },
                    { name: "users", description: "User management endpoints" },
                    { name: "jobs", description: "Job listing endpoints" },
                    { name: "companies", description: "Company management endpoints" },
                    { name: "comments", description: "Comment endpoints" },
                    { name: "likes", description: "Like endpoints" },
                    { name: "favorites", description: "Favorites endpoints" },
                ],
            },
            path: "/docs",
        })
    )
    .use(authMiddleware) // Add authentication middleware
    // Register routes
    .use(authRoutes)
    .use(userRoutes)
    .use(jobRoutes)
    .use(companyRoutes)
    .use(commentRoutes)
    .use(likeRoutes)
    .use(adminRoutes)
    .use(favoritesRoutes)
    .onError(({ code, error, set, request }) => {
        if (code === 'VALIDATION') {
            const { lang } = deriveLang({ request });
            set.status = 422;
            return {
                success: false,
                status: 422,
                message: translate('validation.error', lang),
                errors: error.all
            };
        }
    })
    // Health check endpoint
    .get("/", () => ({
        message: "IT Job Hub API is running!",
        timestamp: new Date().toISOString(),
    }));

export type App = typeof app;
