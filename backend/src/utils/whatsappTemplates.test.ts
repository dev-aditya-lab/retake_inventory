import { describe, expect, it } from "vitest";
import {
	buildCreateTemplatePayload,
	buildTemplateComponents,
	classifyMedia,
	cleanVariable,
	parseMetaTemplate,
	renderTemplateText,
	templateProblems,
	TemplateValueError,
	variablesIn,
	type NewTemplate,
} from "./whatsappTemplates";

const invoiceRaw = {
	id: "123",
	name: "cus_digital_invoice_01_",
	language: "en",
	status: "approved",
	category: "utility",
	quality_score: { score: "green" },
	rejected_reason: "NONE",
	components: [
		{ type: "HEADER", format: "TEXT", text: "Invoice {{1}}" },
		{ type: "BODY", text: "Hi {{1}}, your bill of {{2}} is ready." },
		{ type: "FOOTER", text: "Thank you" },
		{
			type: "BUTTONS",
			buttons: [
				{
					type: "URL",
					text: "View",
					url: "https://x.test/invoice/{{1}}",
				},
				{ type: "QUICK_REPLY", text: "Thanks" },
				{
					type: "PHONE_NUMBER",
					text: "Call",
					phone_number: "+919999999999",
				},
			],
		},
	],
};

describe("variablesIn", () => {
	it("lists variables once, in order", () => {
		expect(variablesIn("a {{2}} b {{1}} c {{2}}")).toEqual(["2", "1"]);
		expect(variablesIn("hi {{ customer_name }}")).toEqual([
			"customer_name",
		]);
		expect(variablesIn("none")).toEqual([]);
	});
});

describe("parseMetaTemplate", () => {
	it("reads a full template", () => {
		const t = parseMetaTemplate(invoiceRaw)!;
		expect(t).toMatchObject({
			name: "cus_digital_invoice_01_",
			status: "APPROVED",
			category: "UTILITY",
			quality: "GREEN",
			reason: "",
			headerFormat: "TEXT",
			headerVariables: ["1"],
			bodyVariables: ["1", "2"],
			footerText: "Thank you",
			parameterFormat: "POSITIONAL",
		});
		expect(t.buttons.map((b) => b.type)).toEqual([
			"URL",
			"QUICK_REPLY",
			"PHONE_NUMBER",
		]);
	});

	it("rejects entries without a name or language", () => {
		expect(parseMetaTemplate({ name: "x" })).toBeUndefined();
		expect(parseMetaTemplate(null)).toBeUndefined();
	});

	it("keeps a real rejection reason", () => {
		expect(
			parseMetaTemplate({
				...invoiceRaw,
				rejected_reason: "INCORRECT_CATEGORY",
			})!.reason,
		).toBe("INCORRECT_CATEGORY");
	});
});

describe("buildTemplateComponents", () => {
	const t = parseMetaTemplate(invoiceRaw)!;

	it("builds header, body and url button parameters", () => {
		const components = buildTemplateComponents(t, {
			header: ["INV-1"],
			body: ["Asha", "₹500"],
			buttonUrlValues: ["INV-1"],
		});
		expect(components).toEqual([
			{ type: "header", parameters: [{ type: "text", text: "INV-1" }] },
			{
				type: "body",
				parameters: [
					{ type: "text", text: "Asha" },
					{ type: "text", text: "₹500" },
				],
			},
			{
				type: "button",
				sub_type: "url",
				index: "0",
				parameters: [{ type: "text", text: "INV-1" }],
			},
		]);
	});

	it("throws a friendly error when a value is missing", () => {
		expect(() =>
			buildTemplateComponents(t, { header: ["INV-1"], body: ["Asha"] }),
		).toThrow(TemplateValueError);
		expect(() =>
			buildTemplateComponents(t, {
				header: ["INV-1"],
				body: ["Asha", " "],
			}),
		).toThrow(/body/);
	});

	it("uses parameter_name for named templates", () => {
		const named = parseMetaTemplate({
			name: "n",
			language: "en",
			parameter_format: "NAMED",
			components: [{ type: "BODY", text: "Hi {{customer}}!" }],
		})!;
		expect(buildTemplateComponents(named, { body: ["Asha"] })).toEqual([
			{
				type: "body",
				parameters: [
					{ type: "text", parameter_name: "customer", text: "Asha" },
				],
			},
		]);
	});

	it("needs an https link for media headers", () => {
		const media = parseMetaTemplate({
			name: "m",
			language: "en",
			components: [
				{ type: "HEADER", format: "IMAGE" },
				{ type: "BODY", text: "Look" },
			],
		})!;
		expect(() => buildTemplateComponents(media, {})).toThrow(
			/image header/,
		);
		expect(() =>
			buildTemplateComponents(media, {
				headerMediaUrl: "http://x.test/a.png",
			}),
		).toThrow();
		expect(
			buildTemplateComponents(media, {
				headerMediaUrl: "https://x.test/a.png",
			})[0],
		).toEqual({
			type: "header",
			parameters: [
				{ type: "image", image: { link: "https://x.test/a.png" } },
			],
		});
	});

	it("sends nothing for a template with no variables", () => {
		const plain = parseMetaTemplate({
			name: "p",
			language: "en",
			components: [{ type: "BODY", text: "Hello" }],
		})!;
		expect(buildTemplateComponents(plain)).toEqual([]);
	});
});

describe("cleanVariable / renderTemplateText", () => {
	it("strips newlines and long space runs", () => {
		expect(cleanVariable("a\nb\t c      d")).toBe("a b c   d");
	});

	it("fills the values into the visible text", () => {
		const t = parseMetaTemplate(invoiceRaw)!;
		expect(
			renderTemplateText(t, {
				header: ["INV-1"],
				body: ["Asha", "₹500"],
			}),
		).toBe(
			"Invoice INV-1\n\nHi Asha, your bill of ₹500 is ready.\n\nThank you",
		);
	});
});

describe("creating a template", () => {
	const base: NewTemplate = {
		name: "order_ready",
		language: "en",
		category: "UTILITY",
		body: "Hi {{1}}, order {{2}} is ready for pickup.",
		bodyExamples: ["Asha", "A-12"],
		buttons: [],
	};

	it("accepts a valid template and builds the payload", () => {
		expect(templateProblems(base)).toEqual([]);
		expect(buildCreateTemplatePayload(base)).toEqual({
			name: "order_ready",
			language: "en",
			category: "UTILITY",
			components: [
				{
					type: "BODY",
					text: base.body,
					example: { body_text: [["Asha", "A-12"]] },
				},
			],
		});
	});

	it("flags variable and example mistakes", () => {
		expect(
			templateProblems({
				...base,
				body: "Hi {{2}}",
				bodyExamples: ["a"],
			}),
		).toEqual(expect.arrayContaining([expect.stringMatching(/numbered/)]));
		expect(
			templateProblems({
				...base,
				body: "{{1}} hello",
				bodyExamples: ["a"],
			}),
		).toEqual(
			expect.arrayContaining([expect.stringMatching(/start or end/)]),
		);
		expect(templateProblems({ ...base, bodyExamples: ["Asha"] })).toEqual(
			expect.arrayContaining([expect.stringMatching(/sample value/)]),
		);
	});

	it("checks header, footer and url buttons", () => {
		expect(templateProblems({ ...base, header: "Order {{1}}" })).toEqual(
			expect.arrayContaining([expect.stringMatching(/header variable/)]),
		);
		expect(templateProblems({ ...base, footer: "Hi {{1}}" })).toEqual(
			expect.arrayContaining([expect.stringMatching(/footer/)]),
		);
		expect(
			templateProblems({
				...base,
				buttons: [
					{ type: "URL", text: "Open", url: "http://x.test/{{1}}" },
				],
			}),
		).toEqual(expect.arrayContaining([expect.stringMatching(/https/)]));
		expect(
			templateProblems({
				...base,
				buttons: [
					{
						type: "URL",
						text: "Open",
						url: "https://x.test/{{1}}/more",
					},
				],
			}),
		).toEqual(expect.arrayContaining([expect.stringMatching(/very end/)]));
	});

	it("builds header, footer and button components", () => {
		const payload = buildCreateTemplatePayload({
			...base,
			header: "Order {{1}}",
			headerExample: "A-12",
			footer: "Thanks",
			buttons: [
				{ type: "QUICK_REPLY", text: "Got it" },
				{
					type: "URL",
					text: "Track",
					url: "https://x.test/t/{{1}}",
					example: "A-12",
				},
				{ type: "PHONE_NUMBER", text: "Call", phone: "+919999999999" },
			],
		}) as { components: Record<string, unknown>[] };
		expect(payload.components.map((c) => c.type)).toEqual([
			"HEADER",
			"BODY",
			"FOOTER",
			"BUTTONS",
		]);
		expect(payload.components[0]).toMatchObject({
			example: { header_text: ["A-12"] },
		});
		expect(payload.components[3]).toMatchObject({
			buttons: [
				{ type: "QUICK_REPLY", text: "Got it" },
				{
					type: "URL",
					text: "Track",
					url: "https://x.test/t/{{1}}",
					example: ["A-12"],
				},
				{
					type: "PHONE_NUMBER",
					text: "Call",
					phone_number: "+919999999999",
				},
			],
		});
	});
});

describe("classifyMedia", () => {
	it("classifies by type and enforces size", () => {
		expect(classifyMedia("image/jpeg", 1000)).toEqual({
			ok: true,
			kind: "image",
		});
		expect(classifyMedia("application/pdf; charset=binary", 1000)).toEqual({
			ok: true,
			kind: "document",
		});
		expect(classifyMedia("video/mp4", 1000)).toEqual({
			ok: true,
			kind: "video",
		});
		expect(classifyMedia("image/png", 6 * 1024 * 1024)).toMatchObject({
			ok: false,
		});
		expect(classifyMedia("image/gif", 10)).toMatchObject({ ok: false });
	});
});
