'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { GeoJSON } from 'geojson';
import type { ElevationChartData } from '@/types/datatable';
import { UPDATES_EMAIL } from '@/lib/site-config';
import RouteSubmitDialog from '@/components/RouteSubmitDialog';

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
    </div>
  ),
});

const ElevationProfile = dynamic(
  () => import('@/components/ElevationProfile'),
  { ssr: false }
);

export default function EpicRouteSection({
  slug,
  title,
  hasGpx,
  routeGeojson,
  elevationChartData,
}: {
  slug: string;
  title: string;
  hasGpx: boolean;
  routeGeojson?: GeoJSON;
  elevationChartData?: ElevationChartData;
}) {
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);

  if (!hasGpx && !UPDATES_EMAIL) return null;

  return (
    <div className="mt-8 space-y-4">
      {hasGpx &&
        (routeGeojson ? (
          <>
            <RouteMap raceName={title} geojson={routeGeojson} />
            <ElevationProfile raceName={title} data={elevationChartData} />
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Route map unavailable for this epic.
          </p>
        ))}

      {UPDATES_EMAIL && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Have a GPX for this route?{' '}
          <button
            type="button"
            onClick={() => setRouteDialogOpen(true)}
            className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
          >
            Submit a route
          </button>
          .
        </p>
      )}

      {UPDATES_EMAIL && (
        <RouteSubmitDialog
          open={routeDialogOpen}
          onClose={() => setRouteDialogOpen(false)}
          filePath={`epics/${slug}.geojson`}
          itemTitle={title}
        />
      )}
    </div>
  );
}
