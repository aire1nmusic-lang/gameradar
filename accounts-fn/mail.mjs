const NOTICE = {
  EXISTS: ['Аккаунт уже существует', 'Этот адрес указали при регистрации на GameScout, но аккаунт с ним уже есть.'],
  NO_ACCOUNT: ['Аккаунт не найден', 'Для этого адреса запрошено восстановление пароля на GameScout, но аккаунта с ним нет.'],
}
/** A letter without any token: it only tells the owner of the address what happened and where to go. */
export function noticeMail(to, kind, accountUrl) {
  const [subject, lead] = NOTICE[kind] ?? NOTICE.NO_ACCOUNT
  const advice = 'Если это были вы, откройте страницу аккаунта: войдите, восстановите пароль или зарегистрируйтесь с нужным адресом. Если вы ничего не запрашивали, просто удалите это письмо.'
  const text = [lead, '', advice, accountUrl, '', 'GameScout'].join('\n')
  const html = `<p>${lead}</p><p>${advice}</p><p><a href="${accountUrl}">${accountUrl}</a></p><p>GameScout</p>`
  return { to, subject: `GameScout: ${subject}`, text, html }
}
