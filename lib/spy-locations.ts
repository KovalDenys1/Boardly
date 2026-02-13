import { prisma } from '@/lib/db'

export interface SpyLocationConfig {
  name: string
  category: string
  roles: string[]
}

export type SpyLocationSource = 'database' | 'fallback'

export interface ActiveSpyLocationsResult {
  locations: SpyLocationConfig[]
  source: SpyLocationSource
}

// Fallback set used when DB has no active Spy locations configured.
// Keep at least 9+ roles per location to support max player count safely.
const FALLBACK_SPY_LOCATIONS: SpyLocationConfig[] = [
  {
    name: 'Airport',
    category: 'Travel',
    roles: [
      'Pilot',
      'Flight Attendant',
      'Security Guard',
      'Passenger',
      'Customs Officer',
      'Baggage Handler',
      'Check-in Agent',
      'Air Traffic Controller',
      'Duty-Free Clerk',
      'Airport Manager',
    ],
  },
  {
    name: 'Train Station',
    category: 'Travel',
    roles: [
      'Conductor',
      'Passenger',
      'Ticket Inspector',
      'Station Master',
      'Security Guard',
      'Cafe Worker',
      'Porter',
      'Platform Attendant',
      'Cleaner',
      'Information Desk Agent',
    ],
  },
  {
    name: 'Hospital',
    category: 'Public',
    roles: [
      'Doctor',
      'Nurse',
      'Patient',
      'Surgeon',
      'Paramedic',
      'Receptionist',
      'Pharmacist',
      'Lab Technician',
      'Security Guard',
      'Janitor',
    ],
  },
  {
    name: 'School',
    category: 'Public',
    roles: [
      'Teacher',
      'Student',
      'Principal',
      'Coach',
      'Counselor',
      'Librarian',
      'Cafeteria Worker',
      'Bus Driver',
      'Security Guard',
      'Janitor',
    ],
  },
  {
    name: 'Restaurant',
    category: 'Workplace',
    roles: [
      'Chef',
      'Waiter',
      'Host',
      'Customer',
      'Bartender',
      'Manager',
      'Dishwasher',
      'Sous Chef',
      'Food Critic',
      'Delivery Driver',
    ],
  },
  {
    name: 'Office',
    category: 'Workplace',
    roles: [
      'Manager',
      'Employee',
      'Intern',
      'Receptionist',
      'IT Specialist',
      'HR Specialist',
      'Accountant',
      'Team Lead',
      'Security Guard',
      'Janitor',
    ],
  },
  {
    name: 'Beach',
    category: 'Recreation',
    roles: [
      'Lifeguard',
      'Tourist',
      'Surfer',
      'Vendor',
      'Photographer',
      'Beach Volleyball Player',
      'Coach',
      'Snack Bar Worker',
      'Cleaner',
      'Sailor',
    ],
  },
  {
    name: 'Movie Theater',
    category: 'Entertainment',
    roles: [
      'Projectionist',
      'Ticket Seller',
      'Usher',
      'Moviegoer',
      'Security Guard',
      'Concession Worker',
      'Manager',
      'Cleaner',
      'Technician',
      'Critic',
    ],
  },
]

export function getFallbackSpyLocations(): SpyLocationConfig[] {
  return FALLBACK_SPY_LOCATIONS.map((location) => ({
    ...location,
    roles: [...location.roles],
  }))
}

function allowSpyFallback(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  return process.env.SPY_LOCATIONS_ALLOW_FALLBACK === 'true'
}

export async function getActiveSpyLocations(): Promise<ActiveSpyLocationsResult> {
  const dbLocations = await prisma.spyLocations.findMany({
    where: { isActive: true },
    select: {
      name: true,
      category: true,
      roles: true,
    },
  })

  if (dbLocations.length > 0) {
    return {
      locations: dbLocations,
      source: 'database',
    }
  }

  if (!allowSpyFallback()) {
    throw new Error(
      'No active Spy locations found in database. Seed SpyLocations table (isActive=true), e.g. `npm run db:seed:spy-locations`.'
    )
  }

  return {
    locations: getFallbackSpyLocations(),
    source: 'fallback',
  }
}
