/**
 * Zero-dependency YAML 1.2 serializer for OpenAPI 3.0.1 specifications.
 */

const RESERVED_SCALARS = new Set([
  'true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~'
]);

function needsQuotes(str) {
  if (str === '') return true;
  if (RESERVED_SCALARS.has(str.toLowerCase())) return true;
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(str)) return true;
  if (/^0x[0-9a-fA-F]+$/.test(str)) return true;
  if (/[:#\[\]{}&*!|>'"%@`,?]/.test(str)) return true;
  if (/^\s|\s$/.test(str)) return true;
  if (str.startsWith('-')) return true;
  return false;
}

function formatKey(key) {
  const str = String(key);
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(str) && !RESERVED_SCALARS.has(str.toLowerCase())) {
    return str;
  }
  return JSON.stringify(str);
}

function formatScalar(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean' || typeof val === 'number') {
    return Number.isFinite(val) || typeof val === 'boolean' ? String(val) : 'null';
  }
  const str = String(val);
  if (str.includes('\n')) {
    return null; // Handled as block scalar by caller
  }
  return needsQuotes(str) ? JSON.stringify(str) : str;
}

/**
 * Convert a JavaScript value to a YAML string.
 * @param {unknown} value
 * @param {number} [indent=0]
 * @returns {string}
 */
export function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    return formatScalar(value);
  }
  if (typeof value === 'string') {
    if (value.includes('\n')) {
      const lines = value.split('\n').map((line) => `${'  '.repeat(indent + 1)}${line}`);
      return `|\n${lines.join('\n')}`;
    }
    return formatScalar(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const lines = [];
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        if (Array.isArray(item)) {
          if (item.length === 0) {
            lines.push(`${pad}- []`);
          } else {
            lines.push(`${pad}-`);
            lines.push(toYaml(item, indent + 1));
          }
        } else {
          const keys = Object.keys(item);
          if (keys.length === 0) {
            lines.push(`${pad}- {}`);
          } else {
            const firstKey = keys[0];
            const firstVal = item[firstKey];
            const firstFormatted = formatKey(firstKey);
            if (firstVal !== null && typeof firstVal === 'object' && (!Array.isArray(firstVal) || firstVal.length > 0) && (Array.isArray(firstVal) || Object.keys(firstVal).length > 0)) {
              lines.push(`${pad}- ${firstFormatted}:`);
              lines.push(toYaml(firstVal, indent + 2));
            } else if (typeof firstVal === 'string' && firstVal.includes('\n')) {
              lines.push(`${pad}- ${firstFormatted}: ${toYaml(firstVal, indent + 1)}`);
            } else {
              lines.push(`${pad}- ${firstFormatted}: ${toYaml(firstVal, indent + 1)}`);
            }
            for (let i = 1; i < keys.length; i += 1) {
              const k = keys[i];
              const v = item[k];
              const fk = formatKey(k);
              if (v !== null && typeof v === 'object' && ((Array.isArray(v) && v.length > 0) || (!Array.isArray(v) && Object.keys(v).length > 0))) {
                lines.push(`${pad}  ${fk}:`);
                lines.push(toYaml(v, indent + 2));
              } else {
                lines.push(`${pad}  ${fk}: ${toYaml(v, indent + 1)}`);
              }
            }
          }
        }
      } else {
        lines.push(`${pad}- ${toYaml(item, indent + 1)}`);
      }
    }
    return lines.join('\n');
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const lines = [];
    for (const key of keys) {
      const val = value[key];
      const fk = formatKey(key);
      if (val !== null && typeof val === 'object' && ((Array.isArray(val) && val.length > 0) || (!Array.isArray(val) && Object.keys(val).length > 0))) {
        lines.push(`${pad}${fk}:`);
        lines.push(toYaml(val, indent + 1));
      } else {
        lines.push(`${pad}${fk}: ${toYaml(val, indent)}`);
      }
    }
    return lines.join('\n');
  }

  return String(value);
}
