export type SuccessResponseType = {
  data: any;
  message: string;
};

export type ErrorResponseType = {
  error: string;
};

export type ValidationErrorField = {
  field: string;
  message: string;
  code: string;
};

export type ValidationErrorResponseType = {
  error: string;
  details: {
    type: "validation";
    fields: ValidationErrorField[];
  };
};