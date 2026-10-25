const CHINESE_DIGITS = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const ROMAN_NUMERALS = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

const SEASON_PATTERNS = [
  {
    pattern: /第\s*([0-9一二两三四五六七八九十百零〇]+)\s*[季期部篇]/iu,
    number: (value) => parsePositiveInteger(value),
  },
  {
    pattern: /\bseason\s*0*([0-9]{1,2})\b/iu,
    number: (value) => parsePositiveInteger(value),
  },
  {
    pattern: /\b0*([0-9]{1,2})(?:st|nd|rd|th)\s+season\b/iu,
    number: (value) => parsePositiveInteger(value),
  },
  {
    pattern: /\bpart\s*0*([0-9]{1,2})\b/iu,
    number: (value) => parsePositiveInteger(value),
  },
  {
    pattern: /\bs0*([1-9][0-9]?)\b/iu,
    number: (value) => parsePositiveInteger(value),
  },
  {
    pattern: /(?:^|[\s:：·\-])([ivx]{1,8})(?=\s*(?:season|part)\b|$)/iu,
    number: (value) => ROMAN_NUMERALS[value.toLocaleLowerCase()] ?? null,
  },
];

function parsePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99
    ? number
    : null;
}

export function parseChineseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^\d+$/u.test(text)) {
    return parsePositiveInteger(text);
  }

  let total = 0;
  let current = 0;
  for (const character of text) {
    if (Object.hasOwn(CHINESE_DIGITS, character)) {
      current = CHINESE_DIGITS[character];
      continue;
    }
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    return null;
  }

  const number = total + current;
  return Number.isInteger(number) && number >= 1 && number <= 99
    ? number
    : null;
}

export function parseSeasonLabel(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) {
    return { number: null, label: null };
  }

  for (const candidate of SEASON_PATTERNS) {
    const match = text.match(candidate.pattern);
    if (!match) {
      continue;
    }
    const raw = match[1];
    const number =
      /^[0-9]+$/u.test(raw)
        ? parsePositiveInteger(raw)
        : candidate.number(raw) ?? parseChineseNumber(raw);
    if (number) {
      return {
        number,
        label: `第${number}季`,
      };
    }
  }
  return { number: null, label: null };
}

function coerceYear(value) {
  const match = String(value ?? "").match(/^(\d{4})/u);
  return match ? Number(match[1]) : null;
}

function coerceSeasonNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 99
    ? number
    : null;
}

export function createSeasonDescriptor({
  key,
  title,
  names = [],
  begin = null,
  year = null,
  season = null,
} = {}) {
  const explicitNumber = coerceSeasonNumber(season?.number);
  const parsed = [title, ...names]
    .map(parseSeasonLabel)
    .find((candidate) => candidate.number);
  const number = explicitNumber ?? parsed?.number ?? null;
  const label =
    String(season?.label ?? "").trim() ||
    parsed?.label ||
    (number ? `第${number}季` : null);
  const cleanKey = String(key ?? season?.key ?? "").trim() || null;

  return {
    key: cleanKey,
    number,
    label,
    year: coerceYear(year) ?? coerceYear(begin),
  };
}

export function seasonLabelFromItem(item) {
  if (item?.season?.label) {
    return String(item.season.label);
  }
  if (item?.season?.number) {
    return `第${item.season.number}季`;
  }
  return parseSeasonLabel(
    [item?.displayTitle, item?.title, ...(item?.names ?? [])]
      .filter(Boolean)
      .join(" "),
  ).label;
}
