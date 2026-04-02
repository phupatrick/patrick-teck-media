export function repairEncodingArtifacts(value) {
  const input = String(value || "");
  const suspiciousPattern = /(?:\u00e2(?:\u20ac|[\u0080-\u00bf]))|(?:[\u00c2-\u00c6][\u0080-\u00ff])|(?:\u00e1[\u00ba\u00bb])/;

  if (!input || !suspiciousPattern.test(input)) {
    return input;
  }

  const repaired = decodeWindows1252Mojibake(input);
  return scoreEncodingQuality(repaired) < scoreEncodingQuality(input) ? repaired : input;
}

function scoreEncodingQuality(value) {
  return [
    /(?:\u00e2(?:\u20ac|[\u0080-\u00bf]))/g,
    /(?:[\u00c2-\u00c6][\u0080-\u00ff])/g,
    /(?:\u00e1[\u00ba\u00bb])/g,
    /Ă¯Â¿Â½/g
  ].reduce((sum, pattern) => sum + ((String(value || "").match(pattern) || []).length * 2), 0);
}

function decodeWindows1252Mojibake(value) {
  const cp1252 = new Map([
    ["\u20ac", 0x80],
    ["\u201a", 0x82],
    ["\u0192", 0x83],
    ["\u201e", 0x84],
    ["\u2026", 0x85],
    ["\u2020", 0x86],
    ["\u2021", 0x87],
    ["\u02c6", 0x88],
    ["\u2030", 0x89],
    ["\u0160", 0x8a],
    ["\u2039", 0x8b],
    ["\u0152", 0x8c],
    ["\u017d", 0x8e],
    ["\u2018", 0x91],
    ["\u2019", 0x92],
    ["\u201c", 0x93],
    ["\u201d", 0x94],
    ["\u2022", 0x95],
    ["\u2013", 0x96],
    ["\u2014", 0x97],
    ["\u02dc", 0x98],
    ["\u2122", 0x99],
    ["\u0161", 0x9a],
    ["\u203a", 0x9b],
    ["\u0153", 0x9c],
    ["\u017e", 0x9e],
    ["\u0178", 0x9f]
  ]);

  const bytes = [];

  for (const char of String(value || "")) {
    const code = char.codePointAt(0);

    if (typeof code !== "number") {
      continue;
    }

    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    if (cp1252.has(char)) {
      bytes.push(cp1252.get(char));
      continue;
    }

    return String(value || "");
  }

  return Buffer.from(bytes).toString("utf8");
}
