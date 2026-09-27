/** Conservative zero-cost gate. Ambiguous names wait for the AI review slice. */
export function classifyLocalNickname(value) {
  const nick=typeof value==='string'?value.trim():''
  if (!nick || nick.length>32 || /[\u0000-\u001f\u007f]/.test(nick)
    || /(?:https?:\/\/|www\.|@|\.ru\b|\.com\b|fuck|shit|хуй|хуе|пизд|еб[аоу]|бля)/iu.test(nick))
    return {decision:'ANONYMOUS',publicNick:'Анонимно'}
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,31}$/u.test(nick) || /[._ -]{3,}/.test(nick))
    return {decision:'REVIEW',publicNick:'Анонимно'}
  return {decision:'ALLOW',publicNick:nick}
}
