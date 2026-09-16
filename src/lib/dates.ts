export function formatCalendarDate(isoDate: string): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const [, month, day] = isoDate.split('-');
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}
