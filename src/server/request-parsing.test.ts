import { describe, expect, it } from "vitest";
import {
  firstFormDataString,
  formDataString,
  formDataStringList,
  optionalFormDataBoolean,
  optionalJsonBoolean,
  optionalJsonString,
  optionalTrimmedFormDataString,
  parseJsonObject,
} from "./request-parsing";

const invalidRequestBody = "Invalid request body.";

describe("request parsing", () => {
  it("returns the first repeated string while validating every value", () => {
    const formData = new FormData();
    formData.append("field", "first");
    formData.append("field", "second");
    formData.set("raw", "  raw  ");

    expect(firstFormDataString(formData, "field")).toBe("first");
    expect(formDataString(formData, "field")).toBe("first");
    expect(formDataString(formData, "raw")).toBe("  raw  ");
    expect(formDataString(formData, "missing")).toBe("");
  });

  it("rejects File values in scalar and list form fields", () => {
    const scalarFormData = new FormData();
    scalarFormData.append("field", "first");
    scalarFormData.append("field", new File(["bad"], "field.txt"));

    expect(() => firstFormDataString(scalarFormData, "field")).toThrow(
      invalidRequestBody,
    );

    const listFormData = new FormData();
    listFormData.append("field", "first");
    listFormData.append("field", new File(["bad"], "field.txt"));

    expect(() => formDataStringList(listFormData, "field")).toThrow(
      invalidRequestBody,
    );
  });

  it("trims optional string fields and ordered string lists", () => {
    const formData = new FormData();
    formData.append("optional", "  value  ");
    formData.append("blank", "   ");
    formData.append("list", " first ");
    formData.append("list", " ");
    formData.append("list", "second");

    expect(optionalTrimmedFormDataString(formData, "optional")).toBe("value");
    expect(optionalTrimmedFormDataString(formData, "blank")).toBeUndefined();
    expect(optionalTrimmedFormDataString(formData, "missing")).toBeUndefined();
    expect(formDataStringList(formData, "list")).toEqual(["first", "second"]);
  });

  it("accepts strict form boolean tokens and rejects invalid values", () => {
    for (const value of ["true", "1", "on"]) {
      const formData = new FormData();
      formData.set("flag", value);
      expect(optionalFormDataBoolean(formData, "flag")).toBe(true);
    }

    for (const value of ["false", "0", "off"]) {
      const formData = new FormData();
      formData.set("flag", value);
      expect(optionalFormDataBoolean(formData, "flag")).toBe(false);
    }

    expect(optionalFormDataBoolean(new FormData(), "flag")).toBe(false);

    for (const value of ["yes", " true ", ""]) {
      const formData = new FormData();
      formData.set("flag", value);
      expect(() => optionalFormDataBoolean(formData, "flag")).toThrow(
        invalidRequestBody,
      );
    }
  });

  it("parses only JSON objects", () => {
    const object = { value: "ok" };

    expect(parseJsonObject(object)).toBe(object);

    for (const value of [null, [], "string", 1, true]) {
      expect(() => parseJsonObject(value)).toThrow(invalidRequestBody);
    }
  });

  it("trims optional JSON strings and validates optional JSON booleans", () => {
    const record = parseJsonObject({
      present: "  value  ",
      blank: "   ",
      yes: true,
      no: false,
    });

    expect(optionalJsonString(record, "present")).toBe("value");
    expect(optionalJsonString(record, "blank")).toBeUndefined();
    expect(optionalJsonString(record, "missing")).toBeUndefined();
    expect(optionalJsonBoolean(record, "yes")).toBe(true);
    expect(optionalJsonBoolean(record, "no")).toBe(false);
    expect(optionalJsonBoolean(record, "missing")).toBeUndefined();

    for (const value of [null, 1, false, {}, []]) {
      expect(() => optionalJsonString({ value }, "value")).toThrow(
        invalidRequestBody,
      );
    }

    for (const value of [null, 1, "true", {}, []]) {
      expect(() => optionalJsonBoolean({ value }, "value")).toThrow(
        invalidRequestBody,
      );
    }
  });
});
