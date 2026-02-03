import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: "error"
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "error",
            "@typescript-eslint/no-explicit-any": "error",
            "no-console": "warn",
            "no-undef": "off",
            "no-restricted-syntax": [
                "error",
                {
                    "selector": "TSTypeAnnotation[typeAnnotation.type='TSUnknownKeyword']",
                    "message": "The 'unknown' type is forbidden. Use a specific type or 'object'/'Record<string, any>' (if unsafe) or validation."
                }
            ]
        }
    }
];
