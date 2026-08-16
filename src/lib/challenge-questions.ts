export type ChallengeOption = {
  value: string;
  label: string;
};

export type ChallengeQuestion = {
  id: string;
  prompt: string;
  hint: string;
  hintUrl?: string;
  options: ChallengeOption[];
};

export const CHALLENGE_QUESTIONS: ChallengeQuestion[] = [
  {
    id: 'ben-nevis-record',
    prompt: 'Who holds the men\'s Ben Nevis race record?',
    hint: 'A legendary name from the classic mountain races era',
    hintUrl: '/races/BenNevis',
    options: [
      { value: 'kenny-stuart', label: 'Kenny Stuart' },
      { value: 'jock-sharp', label: 'Jock Sharp' },
      { value: 'martin-stefko', label: 'Martin Stefko' },
      { value: 'andrew-lemaster', label: 'Andrew LeMaster' },
    ],
  },
  {
    id: 'year-shr-founded',
    prompt: 'What year was Scottish Hill Runners formed?',
    hint: 'The answer is a four-digit year from the 1980s',
    hintUrl: '/info/history',
    options: [
      { value: '1983', label: '1983' },
      { value: '1984', label: '1984' },
      { value: '1987', label: '1987' },
      { value: '1980', label: '1980' },
    ],
  },
  {
    id: 'two-breweries-month',
    prompt: 'In which month is the Two Breweries Hill Race normally held?',
    hint: 'It\'s a nice time of year for running, not too hot and usually not too cold either',
    hintUrl: '/races/TwoBreweries',
    options: [
      { value: 'january', label: 'January' },
      { value: 'february', label: 'February' },
      { value: 'july', label: 'July' },
      { value: 'september', label: 'September' },
    ],
  },
  {
    id: 'hardest-race',
    prompt: 'Which race is one of the longest and hardest in the SHR calendar?',
    hint: 'It takes place on a rugged island famous for its whisky',
    hintUrl: '/races',
    options: [
      { value: 'ben-nevis', label: 'Ben Nevis' },
      { value: 'dumyat', label: 'Dumyat Hill Race' },
      { value: 'jura', label: 'Isle of Jura Fell Race' },
      { value: 'cow-hill', label: 'Cow Hill' },
    ],
  },
];

export function getRandomChallengeQuestion(): ChallengeQuestion {
  const randomIndex = Math.floor(Math.random() * CHALLENGE_QUESTIONS.length);
  return CHALLENGE_QUESTIONS[randomIndex] ?? CHALLENGE_QUESTIONS[0];
}
