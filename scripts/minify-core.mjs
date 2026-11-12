/**
 * minify-core.mjs —— 构建期无损压缩（纯函数，便于自测）
 *
 * 只做**语义安全**的删减，不做重命名：
 *   - JS：删注释、行首缩进、空行、行尾空白；空白串折叠为单个空格；
 *     字符串 / 模板字面量 / 正则字面量内容逐字节保留；跨行块注释保留一个换行，
 *     避免改变自动分号插入（ASI）行为。
 *     另做四条等价替换（有明确语法前提，见 NO_NL_AFTER / LITERAL_ALIAS / KEYWORD_PUNCT_NEXT）：
 *     ① 前一个词法单位已自终止（`; { [ , : =`）时的换行可直接省掉——这些位置不可能触发 ASI；
 *     ② 表达式位置的 `true/false/undefined` 写作 `!0/!1/void 0`，属性名与成员名保持原样；
 *     ③ `}` 前的语句分号、关键字后的标点前空格、`0.5` 的前导零均可省；
 *     ④ `}` 后换行接标识符时可省（块结束或同表达式的 in/instanceof），接 `(`/`[` 等仍保留。
 *   - CSS：删注释与多余空白；引号字符串与 `url(...)` 内容原样保留。
 *
 * 源文件保持可读；压缩只发生在 `pack-core.mjs` 内联时，CSP 哈希按压缩后内容重算。
 */

const ID_CHAR = /[A-Za-z0-9_$]/;
const ID_START = /[A-Za-z_$]/;
const KEYWORD_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw'
]);
const REGEX_PREFIX_CHARS = '([{,;:?=!&|+-*%^~<>';

const isIdChar = ch => !!ch && (ID_CHAR.test(ch) || ch.charCodeAt(0) > 0x7e);

/* 向前找下一个有效字符（跳过空白与注释），用于判断标识符是否处于属性名位置 */
function nextSignificant(s, j) {
  while (j < s.length) {
    const c = s[j];
    if (c === '/' && s[j + 1] === '/') {
      const e = s.indexOf('\n', j);
      if (e < 0) return '';
      j = e;
      continue;
    }
    if (c === '/' && s[j + 1] === '*') {
      const e = s.indexOf('*/', j + 2);
      if (e < 0) return '';
      j = e + 2;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { j++; continue; }
    return c;
  }
  return '';
}

/* 等长或更短的等价字面量替换（只在表达式位置生效，属性名/成员名保持原样） */
const LITERAL_ALIAS = new Map([['true', '!0'], ['false', '!1'], ['undefined', 'void 0']]);

/* 这些字符与相邻空白之间不可能发生分词合并（都不是标识符字符），空格可省。
   `+ -` 也在此列，但连续正负号之间必须保留空格（`a - -b` 删空格会合成 `a--b`），由 keepSpace 兜底。 */
const DROP_SPACE_CHARS = ')]},;:=[({=<>*%^&|!~+-?';

/* 这些关键字与紧随的标点之间无需空格（`return(x)`/`throw{...}`/`case'x':` 均合法）；
   后跟标识符/数字/正则时仍必须保留空格（`return x`、`typeof x`）。 */
const KEYWORD_PUNCT_NEXT = new Set(['return', 'throw', 'delete', 'typeof', 'void', 'case', 'yield', 'await']);
const PUNCT_AFTER_KEYWORD = '([{!"\'`~+-';

/* 这些字符之后换行不承担自动分号插入（ASI），可以直接省掉；
   同样排除 `+ -`（`a -\n-b` 删换行会变成 `a--b`）。 */
const NO_NL_AFTER = ';{[(,:=<>*%^&|!~?';
/* 这些字符之前的换行同样不承担 ASI（前一语句已语义完整时，下一行以闭合/分隔标点开始） */
const NO_NL_BEFORE = ')]},;:?';

/* 正则字面量：命中返回结束位置（含 flags），失败返回 -1（按除号处理） */
function scanRegex(s, i) {
  let j = i + 1;
  let inClass = false;
  while (j < s.length) {
    const c = s[j];
    if (c === '\n' || c === '\r') return -1;
    if (c === '\\') {
      if (s[j + 1] === '\n' || s[j + 1] === '\r' || s[j + 1] === undefined) return -1;
      j += 2;
      continue;
    }
    if (c === '[') { inClass = true; j++; continue; }
    if (c === ']') { inClass = false; j++; continue; }
    if (c === '/' && !inClass) {
      j++;
      while (j < s.length && /[a-z]/.test(s[j])) j++;
      return j;
    }
    j++;
  }
  return -1;
}

/* 模板字面量：${...} 内的嵌套模板与字符串也要正确跳过（内容原样保留） */
function scanTemplate(s, i) {
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && s[j + 1] === '{') { j = scanBraced(s, j + 2); continue; }
    j++;
  }
  return s.length;
}

function scanBraced(s, j) {
  let depth = 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '"' || c === "'") {
      const q = c;
      j++;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === q) { j++; break; }
        j++;
      }
      continue;
    }
    if (c === '`') { j = scanTemplate(s, j); continue; }
    if (c === '/' && s[j + 1] === '/') {
      const e = s.indexOf('\n', j);
      j = e < 0 ? s.length : e;
      continue;
    }
    if (c === '/' && s[j + 1] === '*') {
      const e = s.indexOf('*/', j + 2);
      if (e < 0) return s.length;
      j = e + 2;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j + 1; }
    j++;
  }
  return s.length;
}

function regexAllowed(prevSig, lastWord) {
  if (!prevSig) return true;
  if (REGEX_PREFIX_CHARS.includes(prevSig)) return true;
  return KEYWORD_BEFORE_REGEX.has(lastWord);
}

export function minifyJs(text) {
  const s = String(text);
  let out = '';
  let i = 0;
  let lineStart = true;
  let pendingSpace = false;
  let prevSig = '';
  let lastWord = '';

  /* 空格是否必须保留：两侧只要有一侧是「不需分词」的标点，删掉空格不会合并词法单位。
     例外：连续正负号之间必须留空格（`a - -b` 删空格会合成 `a--b`，语义从减法变自减）。 */
  const isSign = ch => ch === '+' || ch === '-';
  const keepSpace = ch => {
    if (!pendingSpace || lineStart) return false;
    if (KEYWORD_PUNCT_NEXT.has(lastWord) && PUNCT_AFTER_KEYWORD.includes(ch)) return false;
    if (isSign(prevSig) && isSign(ch)) return true;
    return !(DROP_SPACE_CHARS.includes(prevSig) || DROP_SPACE_CHARS.includes(ch));
  };

  while (i < s.length) {
    const c = s[i];

    if (c === '\n') {
      pendingSpace = false;
      if (!lineStart) {
        /* 前一个词法单位已自终止（分号/开括号/逗号/冒号/等号），换行不承担 ASI，
           直接省掉（下一行缩进同样丢弃，不会补空格）；下一有效字符是闭合/分隔标点时同理 */
        let k = i + 1;
        while (k < s.length && (s[k] === ' ' || s[k] === '\t' || s[k] === '\r')) k++;
        if (NO_NL_AFTER.includes(prevSig) || NO_NL_BEFORE.includes(s[k])) lineStart = true;
        /* `}` 后换行接标识符：要么是块结束后的新语句（`}function`/`}const`），要么是同表达式里的
           `in`/`instanceof`——两者都不依赖 ASI（依赖 ASI 的写法删掉换行后会先变成语法错误，
           被 pack-core 的 vm.Script 解析拦下）。以 `(`/`[`/`+`/`-`/`/` 开头时仍保留换行。 */
        else if (prevSig === '}' && ID_START.test(s[k])) lineStart = true;
        else { out += '\n'; lineStart = true; }
      }
      lastWord = '';
      i++;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      pendingSpace = true;
      i++;
      continue;
    }

    /* 注释：JS 词法里 `//` 与 `/*` 优先于正则起始，先判注释 */
    if (c === '/' && s[i + 1] === '/') {
      const e = s.indexOf('\n', i);
      i = e < 0 ? s.length : e;
      lastWord = '';
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      if (e < 0) throw new Error('minifyJs: 未闭合的块注释');
      const chunk = s.slice(i, e + 2);
      if (chunk.includes('\n')) {
        /* 跨行注释等价于一个换行（ASI 依赖它时行为不变）；自终止单位后同样可省 */
        pendingSpace = false;
        if (!lineStart) { if (!NO_NL_AFTER.includes(prevSig)) out += '\n'; lineStart = true; }
      } else {
        pendingSpace = true;
      }
      i = e + 2;
      lastWord = '';
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length) {
        const d = s[j];
        if (d === '\\') { j += 2; continue; }
        if (d === c) { j++; break; }
        if (d === '\n') break;
        j++;
      }
      if (keepSpace(c)) out += ' ';
      pendingSpace = false;
      out += s.slice(i, j);
      lineStart = false;
      prevSig = 'S';
      lastWord = '';
      i = j;
      continue;
    }

    if (c === '`') {
      const j = scanTemplate(s, i);
      if (keepSpace(c)) out += ' ';
      pendingSpace = false;
      out += s.slice(i, j);
      lineStart = false;
      prevSig = 'S';
      lastWord = '';
      i = j;
      continue;
    }

    if (c === '/') {
      if (regexAllowed(prevSig, lastWord)) {
        const j = scanRegex(s, i);
        if (j > 0) {
          if (keepSpace(c)) out += ' ';
          pendingSpace = false;
          out += s.slice(i, j);
          lineStart = false;
          prevSig = 'S';
          lastWord = '';
          i = j;
          continue;
        }
      }
      if (keepSpace(c)) out += ' ';
      pendingSpace = false;
      out += '/';
      lineStart = false;
      prevSig = '/';
      lastWord = '';
      i++;
      continue;
    }

    /* 数字前导零：0.5 → .5（数值等价，省 1 字节；标识符/属性访问内不触发） */
    if (c === '0' && s[i + 1] === '.' && s[i + 2] >= '0' && s[i + 2] <= '9'
      && !isIdChar(out[out.length - 1]) && out[out.length - 1] !== '.') {
      if (keepSpace(c)) out += ' ';
      pendingSpace = false;
      lastWord = '';
      i++;
      continue;
    }

    /* 字面量别名：true→!0、false→!1、undefined→void 0（表达式位置，属性名/成员名不动） */
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < s.length && isIdChar(s[j])) j++;
      const word = s.slice(i, j);
      let repl = LITERAL_ALIAS.get(word) || '';
      if (repl) {
        const next = nextSignificant(s, j);
        if (prevSig === '.' || (next === ':' && (prevSig === '{' || prevSig === ','))) repl = '';
      }
      if (repl) {
        if (keepSpace(c)) out += ' ';
        pendingSpace = false;
        out += repl;
        lineStart = false;
        prevSig = repl[repl.length - 1];
        lastWord = repl;
        i = j;
        continue;
      }
    }

    /* `;` 在 `}` 前可省（`{a();}` → `{a()}`，`}` 前由 ASI 补分号）。
       唯一危险形式是「空语句作控制体」（`if(x);}`），删后立即变成语法错误，
       由 pack-core 对每个压缩后脚本执行 vm.Script 解析拦下，不会进入产物。 */
    if (c === '}' && prevSig === ';') {
      out = out.slice(0, -1);
      prevSig = '}';
    }

    if (keepSpace(c)) out += ' ';
    pendingSpace = false;
    out += c;
    lineStart = false;
    prevSig = c;
    if (isIdChar(c)) lastWord += c;
    else lastWord = '';
    i++;
  }

  return out;
}

export function minifyCss(text) {
  const s = String(text);
  let out = '';
  let i = 0;
  let pendingSpace = false;
  let dropSpace = false;

  const pushChar = ch => { out += ch; };

  while (i < s.length) {
    const c = s[i];

    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      if (e < 0) throw new Error('minifyCss: 未闭合的注释');
      i = e + 2;
      pendingSpace = true;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === c) { j++; break; }
        j++;
      }
      if (pendingSpace && !dropSpace) pushChar(' ');
      pendingSpace = false;
      dropSpace = false;
      out += s.slice(i, j);
      i = j;
      continue;
    }

    if ((c === 'u' || c === 'U') && s.slice(i, i + 4).toLowerCase() === 'url(') {
      let j = i + 4;
      let depth = 1;
      while (j < s.length) {
        const d = s[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '"' || d === "'") {
          const q = d;
          j++;
          while (j < s.length) {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === q) { j++; break; }
            j++;
          }
          continue;
        }
        if (d === '(') depth++;
        else if (d === ')') { depth--; if (depth === 0) { j++; break; } }
        j++;
      }
      if (pendingSpace && !dropSpace) pushChar(' ');
      pendingSpace = false;
      dropSpace = false;
      out += s.slice(i, j);
      i = j;
      continue;
    }

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
      pendingSpace = true;
      i++;
      continue;
    }

    if (c === '{' || c === '}' || c === ';' || c === ',') {
      pendingSpace = false;
      out += c;
      dropSpace = true;
      i++;
      continue;
    }

    if (pendingSpace && !dropSpace) pushChar(' ');
    pendingSpace = false;
    dropSpace = false;
    out += c;
    i++;
  }

  return out;
}
