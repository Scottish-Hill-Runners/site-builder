export function matchVenuePlusCode(venue: string): RegExpMatchArray | null {
  return venue.match(
    /(^|[^A-Z0-9])([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7})(?![A-Z0-9])/i
  );
}
