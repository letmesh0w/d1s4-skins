// Паузы после неверных попыток входа. Чистая логика, без обращения к браузеру.
export function lockoutSeconds(fails) {
  return [0, 0, 0, 5, 15, 30, 60, 120, 300, 600][Math.min(fails, 9)];
}
export const waitText = sec => (sec >= 90 ? `${Math.ceil(sec / 60)} мин` : `${Math.ceil(sec)} с`);
