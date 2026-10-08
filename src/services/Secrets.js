/*
 * Hides login secrets and personal details in packet text before Jam shows,
 * logs, copies or exports it. The game still gets the real packets; this is
 * only for what people see and save.
 *
 * Hidden:
 *   - the login token (<pword>…</pword>, and any "eyJ…" JWT anywhere)
 *   - the login hash (h="…")
 *   - password / token / session key / hash fields in JSON
 *   - email addresses
 *   - long random-looking strings (32+ letters/numbers), except UUIDs
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RULES = [
  // <pword><![CDATA[...]]></pword>
  [/(<pword>\s*(?:<!\[CDATA\[)?)[\s\S]*?((?:\]\]>)?\s*<\/pword>)/gi, '$1[hidden]$2'],
  // h="..." on the login message
  [/\bh=(['"])[^'"]*\1/g, 'h=$1[hash]$1'],
  // JWTs: three base64url parts starting with eyJ
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[token]'],
  // JSON fields that hold secrets or contact details
  [/("(?:password|pword|pass|token|authToken|auth_token|accessToken|refreshToken|sessionKey|session_key|hash|secret|email|emailAddress|parentEmail)"\s*:\s*")[^"]*(")/gi, '$1[hidden]$2'],
  // email addresses anywhere
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // long random-looking strings (player/device UUIDs are left alone)
  [/\b[A-Za-z0-9+_-]{32,}={0,2}/g, match => UUID.test(match) ? match : '[token]']
]

/**
 * @param {string} text
 * @returns {string}
 */
function hideSecrets (text) {
  if (typeof text !== 'string' || !text) return text
  let out = text
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  return out
}

module.exports = { hideSecrets }
