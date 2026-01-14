import { describe, expect, it } from "bun:test";
import { formatResponse, formatError } from "./response";

describe("Response Utils", () => {
    describe("formatResponse", () => {
        it("should format response with default values", () => {
            const data = { id: 1, name: "Test" };
            const response = formatResponse(data);

            expect(response).toEqual({
                success: true,
                status: 200,
                message: "Success",
                data
            });
        });

        it("should format response with custom message and status", () => {
            const data = { id: 1 };
            const response = formatResponse(data, "Custom Message", 201);

            expect(response).toEqual({
                success: true,
                status: 201,
                message: "Custom Message",
                data
            });
        });
    });

    describe("formatError", () => {
        it("should format error with default values", () => {
            const response = formatError("Error occurred");

            expect(response).toEqual({
                success: false,
                status: 500,
                message: "Error occurred",
                errors: undefined
            });
        });

        it("should format error with custom status and details", () => {
            const errors = { field: "required" };
            const response = formatError("Validation Failed", 400, errors);

            expect(response).toEqual({
                success: false,
                status: 400,
                message: "Validation Failed",
                errors
            });
        });
    });
});
