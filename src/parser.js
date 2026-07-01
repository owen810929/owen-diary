(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.OwenDiaryParser = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const dateToken = "(?:\\d{4}[/-])?\\d{1,2}[/-]\\d{1,2}";
  const rangePattern = new RegExp(`^(${dateToken})\\s*(?:-|~|～)\\s*(${dateToken}|\\d{1,2})$`);

  function inferYear(month) {
    return Number(month) === 12 ? 2025 : 2026;
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function isValidDate(year, month, day) {
    const value = new Date(Date.UTC(year, month - 1, day));
    return value.getUTCFullYear() === year &&
      value.getUTCMonth() === month - 1 &&
      value.getUTCDate() === day;
  }

  function toIsoDate(parts) {
    if (!parts || !isValidDate(parts.year, parts.month, parts.day)) {
      return null;
    }
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function normalizeHeader(raw) {
    return String(raw || "")
      .trim()
      .replace(/[–—−]/g, "-")
      .replace(/\s+/g, " ");
  }

  function parseDateToken(token, fallback) {
    const clean = normalizeHeader(token);
    let match = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
      };
    }

    match = clean.match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (match) {
      const month = Number(match[1]);
      return {
        year: fallback && fallback.year ? fallback.year : inferYear(month),
        month,
        day: Number(match[2])
      };
    }

    match = clean.match(/^(\d{1,2})$/);
    if (match && fallback && fallback.month) {
      return {
        year: fallback.year || inferYear(fallback.month),
        month: fallback.month,
        day: Number(match[1])
      };
    }

    return null;
  }

  function parseDateHeader(rawHeader) {
    const sourceDateText = normalizeHeader(rawHeader);
    if (!sourceDateText) {
      return null;
    }

    const rangeMatch = sourceDateText.match(rangePattern);
    if (rangeMatch) {
      const start = parseDateToken(rangeMatch[1]);
      const end = parseDateToken(rangeMatch[2], start);
      const date = toIsoDate(end);
      if (!date) {
        return null;
      }
      return {
        date,
        sourceDateText,
        fileName: `${date}.json`
      };
    }

    const date = toIsoDate(parseDateToken(sourceDateText));
    if (!date) {
      return null;
    }

    return {
      date,
      sourceDateText,
      fileName: `${date}.json`
    };
  }

  function splitPlainTextSections(text) {
    return String(text || "")
      .split(/\r?\n\s*(?:---+|\[水平線\]|\[Google Doc 水平線等價測試或解析器可處理的 mock 分段\])\s*\r?\n/g)
      .map((section) => section.trim())
      .filter(Boolean);
  }

  function parseSections(sections) {
    const entries = [];
    const unresolved = [];

    sections.forEach((section, index) => {
      const lines = String(section || "")
        .split(/\r?\n/)
        .map((line) => line.trimEnd());
      const firstLineIndex = lines.findIndex((line) => line.trim());

      if (firstLineIndex === -1) {
        return;
      }

      const header = lines[firstLineIndex].trim();
      const parsed = parseDateHeader(header);
      const content = lines.slice(firstLineIndex + 1).join("\n").trim();

      if (!parsed) {
        unresolved.push({
          index,
          sourceDateText: header,
          preview: content.slice(0, 80)
        });
        return;
      }

      entries.push({
        ...parsed,
        title: "",
        content,
        isImportant: false
      });
    });

    return { entries, unresolved };
  }

  function parsePlainTextFixture(text) {
    return parseSections(splitPlainTextSections(text));
  }

  return {
    inferYear,
    parseDateHeader,
    parsePlainTextFixture,
    parseSections,
    splitPlainTextSections
  };
});
