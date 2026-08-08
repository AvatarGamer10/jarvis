import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CalendarEvent } from '@shared/types'
import StudyPlanner from '../components/StudyPlanner'
import WeekGrid from '../components/WeekGrid'
import { Empty, StateNotice } from '../components/ui'
import { navigateTo } from '../lib/app-events'
import { mondayOf, weekTitle } from '../lib/week'
import { useAsync } from '../lib/useAsync'

/**
 * The week.
 *
 * One view, not two. The old build had a grid and a list and made you choose;
 * in practice everyone stayed on the grid, because a week is a shape and a
 * list is not.
 */
export default function Schedule(): JSX.Element {
  /** Weeks away from the current one. 0 is this week. */
  const [offset, setOffset] = useState(0)
  const [planning, setPlanning] = useState(false)

  const monday = useMemo(() => {
    const day = mondayOf(new Date())
    day.setDate(day.getDate() + offset * 7)
    return day
  }, [offset])

  const [from, to] = useMemo(() => {
    const start = new Date(monday)
    const end = new Date(monday)
    end.setDate(end.getDate() + 7)
    return [start.toISOString(), end.toISOString()]
  }, [monday])

  const { data, loading, error, reload } = useAsync<CalendarEvent[]>(
    () => window.vilo.calendar.list(from, to),
    [from, to]
  )

  return (
    <div className="week">
      <div className="week-bar">
        <div className="row" style={{ gap: 2 }}>
          <button
            className="btn ghost icon"
            onClick={() => setOffset((value) => value - 1)}
            aria-label="Previous week"
          >
            <ChevronLeft />
          </button>
          <button
            className="btn ghost icon"
            onClick={() => setOffset((value) => value + 1)}
            aria-label="Next week"
          >
            <ChevronRight />
          </button>
        </div>

        <h2 className="week-title">{weekTitle(monday)}</h2>

        {offset !== 0 && (
          <button className="btn sm" onClick={() => setOffset(0)}>
            Today
          </button>
        )}

        <span className="spacer" />

        <button className="btn ghost icon" onClick={reload} aria-label="Refresh">
          <RefreshCw />
        </button>
        <button className="btn primary" onClick={() => setPlanning(true)}>
          <Wand2 />
          Plan my study
        </button>
      </div>

      {error ? (
        <StateNotice
          tone="error"
          icon={<Calendar />}
          title="Calendar is unavailable"
          hint={error}
          action={
            <div className="row">
              <button className="btn sm" onClick={reload}>Try again</button>
              <button className="btn ghost sm" onClick={() => navigateTo('settings')}>
                Open settings
              </button>
            </div>
          }
        />
      ) : loading && !data ? (
        // The shape of the week rather than a spinner in the middle of it. A
        // spinner tells you to wait; this tells you what is coming.
        <div className="week-skeleton" aria-label="Loading the week">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="week-skeleton-col">
              {Array.from({ length: 3 }, (_, slot) => (
                <div
                  key={slot}
                  className="skeleton"
                  style={{
                    height: 30 + ((day * 3 + slot) % 4) * 22,
                    marginTop: ((day + slot) % 5) * 26,
                    animationDelay: `${(day * 3 + slot) * 40}ms`
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <Empty
          icon={<Calendar />}
          title="Nothing this week"
          hint="Events from Google Calendar show up here, along with any study blocks Vilo creates for you."
          action={
            <button className="btn primary" onClick={() => setPlanning(true)}>
              <Wand2 />
              Plan my study
            </button>
          }
        />
      ) : (
        <WeekGrid events={data ?? []} monday={monday} />
      )}

      {planning && <StudyPlanner onClose={() => setPlanning(false)} onApplied={reload} />}
    </div>
  )
}
