// ESLint rule: user-visible text must come from the message catalogs (docs/i18n-guide.md §3.4, tech spec C5).
// Flags JSX text and string literals in text-bearing JSX attributes / expression children that contain letters (Han characters included).
// Not flagged: strings made of symbols or digits only ("·", "—", "12"), `className`, `data-*`, `id`, `href`, `role`, `type` and other non-text attributes.
const TEXT_ATTRIBUTES = new Set(["aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "title", "alt", "placeholder", "label", "summary"]);
const HAS_LETTER = /\p{L}/u;

/** @type {import("eslint").Rule.RuleModule} */
export const noLiteralStrings = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hard-coded user-visible strings in JSX; use the i18n catalogs" },
    schema: [],
    messages: {
      literal: "Hard-coded text “{{text}}”: add a key to the catalogs (zh-Hant and en) and use t(). See docs/i18n-guide.md §3.",
    },
  },
  create(context) {
    const report = (node, text) => context.report({ node, messageId: "literal", data: { text: text.trim().slice(0, 40) } });
    const stringOf = (expr) => {
      if (!expr) return null;
      if (expr.type === "Literal" && typeof expr.value === "string") return expr.value;
      if (expr.type === "TemplateLiteral" && expr.expressions.length === 0) return expr.quasis.map((q) => q.value.cooked).join("");
      return null;
    };
    return {
      JSXText(node) {
        if (HAS_LETTER.test(node.value)) report(node, node.value);
      },
      JSXAttribute(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : "";
        if (!TEXT_ATTRIBUTES.has(name) || !node.value) return;
        const text = node.value.type === "Literal" ? stringOf(node.value) : node.value.type === "JSXExpressionContainer" ? stringOf(node.value.expression) : null;
        if (text !== null && HAS_LETTER.test(text)) report(node, text);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type !== "JSXElement" && node.parent.type !== "JSXFragment") return;     // only children, not attributes
        const text = stringOf(node.expression);
        if (text !== null && HAS_LETTER.test(text)) report(node, text);
      },
    };
  },
};

export default { rules: { "no-literal-strings": noLiteralStrings } };
