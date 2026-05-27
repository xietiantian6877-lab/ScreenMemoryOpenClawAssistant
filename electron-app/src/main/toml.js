function escapeTomlString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readTomlTopLevel(text) {
  const beforeFirstSection = String(text || "").split(/\n\[/)[0] || "";
  return parseTomlAssignments(beforeFirstSection);
}

function readTomlBlock(text, section) {
  const block = getTomlSectionRaw(text, section);
  return block ? parseTomlAssignments(block.replace(/^\[[^\]]+\]\s*\n/, "")) : {};
}

function getTomlSectionRaw(text, section) {
  const lines = String(text || "").split(/\r?\n/);
  const header = `[${section}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return "";
  const collected = [header];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    collected.push(line);
  }
  return `${collected.join("\n").trim()}\n`;
}

function parseTomlAssignments(block) {
  const values = {};
  for (const rawLine of String(block || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = parseTomlValue(rest.join("=").trim());
  }
  return values;
}

function parseTomlValue(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true" || trimmed === "false") return trimmed;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseTomlBool(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

module.exports = {
  escapeTomlString,
  readTomlTopLevel,
  readTomlBlock,
  getTomlSectionRaw,
  parseTomlBool
};
