'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RaceSelectorProps {
  races: string[];
  currentRace: string;
}

export default function RaceSelector({
  races,
  currentRace,
}: RaceSelectorProps) {
  const router = useRouter();
  const [selectedRace, setSelectedRace] = useState(currentRace);

  const handleRaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const race = e.target.value;
    setSelectedRace(race);
    router.push(`/races/${encodeURIComponent(race)}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="race-select"
        className="text-sm font-medium text-gray-700"
      >
        Select Race:
      </label>
      <select
        id="race-select"
        value={selectedRace}
        onChange={handleRaceChange}
        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        {races.map((race) => (
          <option key={race} value={race}>
            {race}
          </option>
        ))}
      </select>
    </div>
  );
}
