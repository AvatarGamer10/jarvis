import {
  AudioLines,
  Calendar,
  FolderCog,
  GraduationCap,
  ListTodo,
  MessageSquare,
  Settings2,
  type LucideIcon
} from 'lucide-react'

/**
 * The sections of the app, in the order they appear in the rail.
 *
 * The order is load-bearing: it is what Cmd+1..7 counts through, and Voice is
 * first because it is what Vilo is for. Everything else is a place to check
 * what it did.
 */
export type SectionId =
  | 'voice'
  | 'chat'
  | 'schedule'
  | 'tasks'
  | 'grades'
  | 'files'
  | 'settings'

export interface Section {
  id: SectionId
  label: string
  /** Sits under the title in the header. One short sentence, no full stop. */
  tagline: string
  icon: LucideIcon
  /** Words the command palette also matches on, beyond the label. */
  keywords: string[]
}

export const SECTIONS: Section[] = [
  {
    id: 'voice',
    label: 'Voice',
    tagline: 'Hold to talk, let go to send',
    icon: AudioLines,
    keywords: ['speak', 'talk', 'listen', 'microphone', 'dictate']
  },
  {
    id: 'chat',
    label: 'Chat',
    tagline: 'Ask for anything and watch it work',
    icon: MessageSquare,
    keywords: ['ask', 'message', 'agent', 'assistant', 'write']
  },
  {
    id: 'schedule',
    label: 'Schedule',
    tagline: 'Your week, hour by hour',
    icon: Calendar,
    keywords: ['calendar', 'week', 'events', 'agenda', 'timetable']
  },
  {
    id: 'tasks',
    label: 'Tasks',
    tagline: 'Everything you owe, in one list',
    icon: ListTodo,
    keywords: ['todo', 'homework', 'assignments', 'classroom', 'due']
  },
  {
    id: 'grades',
    label: 'Grades',
    tagline: 'Exams, averages, and what you still need',
    icon: GraduationCap,
    keywords: ['marks', 'exams', 'scores', 'average', 'results']
  },
  {
    id: 'files',
    label: 'Files',
    tagline: 'Rules that put every download in its place',
    icon: FolderCog,
    keywords: ['folders', 'organise', 'organize', 'downloads', 'sort', 'move']
  },
  {
    id: 'settings',
    label: 'Settings',
    tagline: 'Account, model, and how Vilo behaves',
    icon: Settings2,
    keywords: ['preferences', 'options', 'account', 'google', 'api', 'model']
  }
]

export function sectionOf(id: SectionId): Section {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]
}
