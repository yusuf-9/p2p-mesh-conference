import { ZodError } from "zod";

export function createUserFriendlyErrorMessage(error: ZodError): string {
    // Group errors by path to provide cleaner messages
    const pathErrors = new Map<string, string[]>();

    for (const issue of error.issues) {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";

        let message: string;
        switch (issue.code) {
            case "invalid_type":
                if ((issue as any).received === "undefined") {
                    message = `Missing required field: "${path}"`;
                } else {
                    message = `Field "${path}" expected ${(issue as any).expected}, but received ${(issue as any).received}`;
                }
                break;
            case "too_small":
                if ((issue as any).type === "string") {
                    message = `Field "${path}" must be at least ${(issue as any).minimum} characters long`;
                } else {
                    message = `Field "${path}" must be at least ${(issue as any).minimum}`;
                }
                break;
            case "too_big":
                if ((issue as any).type === "string") {
                    message = `Field "${path}" must be at most ${(issue as any).maximum} characters long`;
                } else {
                    message = `Field "${path}" must be at most ${(issue as any).maximum}`;
                }
                break;
            case "invalid_union":
                message = `Invalid message type or structure`;
                break;
            case "invalid_value":
                message = `Field "${path}" has an invalid value`;
                break;
            default:
                // Handle other error types with generic messages based on common patterns
                if (issue.message.includes("literal")) {
                    message = `Field "${path}" must have exact value`;
                } else if (issue.message.includes("uuid")) {
                    message = `Field "${path}" must be a valid UUID`;
                } else if (issue.message.includes("enum")) {
                    message = `Field "${path}" must be one of the allowed values`;
                } else {
                    message = `Field "${path}": ${issue.message}`;
                }
        }

        if (!pathErrors.has(path)) {
            pathErrors.set(path, []);
        }
        pathErrors.get(path)!.push(message);
    }

    // Create a user-friendly error message
    const errorMessages = Array.from(pathErrors.values()).flat();

    if (errorMessages.length === 1) {
        return errorMessages[0];
    } else if (errorMessages.length <= 3) {
        return errorMessages.join("; ");
    } else {
        return `Multiple validation errors: ${errorMessages.slice(0, 2).join("; ")} and ${errorMessages.length - 2} more`;
    }
}
