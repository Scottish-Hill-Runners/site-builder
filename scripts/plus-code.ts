import { matchVenuePlusCode } from '@/lib/plus-code';

const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];
const LOCALITY_REFERENCES: Array<{
  pattern: RegExp;
  latitude: number;
  longitude: number;
}> = [
  {
    pattern: /\bcastle douglas\b/i,
    latitude: 54.9405,
    longitude: -3.9271,
  },
  {
    pattern: /\bnewton stewart\b/i,
    latitude: 54.9579,
    longitude: -4.4849,
  },
];

type Coordinates = { latitude: number; longitude: number };

function decodeFullPlusCode(code: string): Coordinates {
  const normalized = code.toUpperCase();
  const separator = normalized.indexOf('+');
  if (
    separator !== 8 ||
    normalized.indexOf('+', separator + 1) !== -1 ||
    normalized.length < 11 ||
    normalized.length > 16
  ) {
    throw new Error(`Invalid full Plus Code: ${code}`);
  }

  const digits = normalized.replace('+', '');
  if ([...digits].some((digit) => !CODE_ALPHABET.includes(digit))) {
    throw new Error(`Invalid full Plus Code: ${code}`);
  }

  let latitude = -90;
  let longitude = -180;
  let resolution = PAIR_RESOLUTIONS[0];
  const pairLength = Math.min(digits.length, 10);
  for (let i = 0; i < pairLength; i += 2) {
    const latitudeDigit = CODE_ALPHABET.indexOf(digits[i]);
    const longitudeDigit = CODE_ALPHABET.indexOf(digits[i + 1]);
    latitude += latitudeDigit * resolution;
    longitude += longitudeDigit * resolution;
    resolution /= 20;
  }

  let latitudeResolution = PAIR_RESOLUTIONS[pairLength / 2 - 1];
  let longitudeResolution = PAIR_RESOLUTIONS[pairLength / 2 - 1];
  for (let i = 10; i < digits.length; i++) {
    const gridIndex = CODE_ALPHABET.indexOf(digits[i]);
    latitudeResolution /= 5;
    longitudeResolution /= 4;
    latitude += Math.floor(gridIndex / 4) * latitudeResolution;
    longitude += (gridIndex % 4) * longitudeResolution;
  }

  latitude += latitudeResolution / 2;
  longitude += longitudeResolution / 2;
  if (latitude > 90 || longitude > 180) {
    throw new Error(`Plus Code is outside the valid coordinate range: ${code}`);
  }
  return { latitude, longitude };
}

function encodePrefix(
  { latitude, longitude }: Coordinates,
  length: number
): string {
  const boundedLatitude = Math.min(90, Math.max(-90, latitude));
  const normalizedLongitude = (((longitude + 180) % 360) + 360) % 360;
  let latitudeOffset =
    (boundedLatitude === 90 ? 90 - 1e-12 : boundedLatitude) + 90;
  let longitudeOffset = normalizedLongitude;
  let prefix = '';

  for (const resolution of PAIR_RESOLUTIONS) {
    prefix += CODE_ALPHABET[Math.floor(latitudeOffset / resolution)];
    prefix += CODE_ALPHABET[Math.floor(longitudeOffset / resolution)];
    latitudeOffset %= resolution;
    longitudeOffset %= resolution;
    if (prefix.length >= length) return prefix.slice(0, length);
  }

  return prefix.slice(0, length);
}

function recoverShortPlusCode(
  code: string,
  reference: Coordinates
): Coordinates {
  const separator = code.indexOf('+');
  const missingPrefixLength = 8 - separator;
  if (
    separator < 2 ||
    separator > 6 ||
    separator % 2 !== 0 ||
    code.indexOf('+', separator + 1) !== -1 ||
    missingPrefixLength < 2 ||
    missingPrefixLength > 6
  ) {
    throw new Error(`Invalid abbreviated Plus Code: ${code}`);
  }

  const resolution = PAIR_RESOLUTIONS[missingPrefixLength / 2 - 1];
  const suffix = code.toUpperCase();
  const recover = (location: Coordinates) =>
    `${encodePrefix(location, missingPrefixLength)}${suffix}`;
  let recovered = recover(reference);
  let decoded = decodeFullPlusCode(recovered);
  const adjustedReference = { ...reference };

  if (reference.latitude + resolution / 2 < decoded.latitude) {
    adjustedReference.latitude -= resolution;
  } else if (reference.latitude - resolution / 2 > decoded.latitude) {
    adjustedReference.latitude += resolution;
  }
  if (reference.longitude + resolution / 2 < decoded.longitude) {
    adjustedReference.longitude -= resolution;
  } else if (reference.longitude - resolution / 2 > decoded.longitude) {
    adjustedReference.longitude += resolution;
  }

  if (
    adjustedReference.latitude !== reference.latitude ||
    adjustedReference.longitude !== reference.longitude
  ) {
    recovered = recover(adjustedReference);
    decoded = decodeFullPlusCode(recovered);
  }

  return decoded;
}

export function coordinatesFromVenue(venue: unknown): Coordinates | undefined {
  if (typeof venue !== 'string') return undefined;
  const match = matchVenuePlusCode(venue);
  if (!match || match.index === undefined) return undefined;

  const code = match[2].toUpperCase();
  const separator = code.indexOf('+');
  if (separator === 8) return decodeFullPlusCode(code);
  if (
    ![2, 4, 6].includes(separator) ||
    [...code.replace('+', '')].some((digit) => !CODE_ALPHABET.includes(digit))
  ) {
    throw new Error(`Invalid abbreviated Plus Code in venue: ${venue}`);
  }

  const locality = venue.slice(match.index + match[1].length + code.length);
  const reference = LOCALITY_REFERENCES.find(({ pattern }) =>
    pattern.test(locality)
  );
  if (!reference) {
    throw new Error(`No Plus Code recovery location found in venue: ${venue}`);
  }

  return recoverShortPlusCode(code, reference);
}

