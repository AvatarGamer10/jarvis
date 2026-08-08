import { useEffect, useMemo, useRef } from 'react'
import type { CalendarEvent } from '@shared/types'
import { timeOf } from '../lib/dates'
import {
  allDayEvents,
  daysOfWeek,
  isStudyBlock,
  placeDay,
  sameDay,
  studyBlockTitle,
  visibleBand
} from '../lib/week'

/** Pixel height of one hour row. Must match `.grid-hour` in views.css. */
const HOUR_PX = 46

interface Props {
  events: CalendarEvent[]
  monday: Date
}

/**
 * The week, laid out by hour.
 *
 * Hour lines are painted as a repeating background rather than as elements, so
 * a fortnight of scrolling is not fourteen hundred divs. The events themselves
 * are absolutely positioned from minute offsets worked out in week.ts, which
 * is also where the overlap columns are decided.
 */
export default function WeekGrid({ events, monday }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => daysOfWeek(monday), [monday])
  const band = useMemo(() => visibleBand(events), [events])
  const hours = useMemo(
    () => Array.from({ length: band.end - band.start }, (_, i) => band.start + i),
    [band]
  )

  const today = new Date()

  /**
   * Open on the working day, not on midnight.
   *
   * Scrolled to an hour before the first thing that is actually on, so the
   * week opens showing content instead of an empty morning.
   */
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return

    const firstHour = events
      .filter((event) => !event.allDay)
      .map((event) => new Date(event.start).getHours())
      .sort((a, b) => a - b)[0]

    const target = Math.max(0, (firstHour ?? 9) - 1 - band.start)
    scroller.scrollTop = target * HOUR_PX
  }, [events, band.start])

  return (
    <div className="grid scroll" ref={scrollRef}>
      <div className="grid-head">
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`grid-day ${sameDay(day, today) ? 'today' : ''}`}
          >
            <div className="dow">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
            <div className="dom">{day.getDate()}</div>
            <div className="allday">
              {allDayEvents(events, day).map((event) => (
                <span key={event.id} className="badge quiet" title={event.title}>
                  {event.title}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-body">
        <div className="grid-hours">
          {hours.map((hour) => (
            <div key={hour} className="grid-hour">
              {String(hour).padStart(2, '0')}
            </div>
          ))}
        </div>

        {days.map((day, index) => (
          <div
            key={day.toISOString()}
            className={`grid-col ${index >= 5 ? 'weekend' : ''}`}
            style={{ height: hours.length * HOUR_PX }}
          >
            {placeDay(events, day, band.start).map((placed) => {
              const study = isStudyBlock(placed.event)
              const width = 100 / placed.columns

              return (
                <div
                  key={placed.event.id}
                  className={`event ${study ? 'study' : ''}`}
                  style={{
                    top: (placed.from / 60) * HOUR_PX,
                    height: Math.max(20, (placed.length / 60) * HOUR_PX - 2),
                    left: `calc(${placed.column * width}% + 3px)`,
                    width: `calc(${width}% - 6px)`
                  }}
                  title={`${placed.event.title}\n${timeOf(placed.event.start)}–${timeOf(
                    placed.event.end
                  )}`}
                >
                  <div className="event-time">{timeOf(placed.event.start)}</div>
                  <div className="clamp-2">
                    {study ? studyBlockTitle(placed.event.title) : placed.event.title}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
