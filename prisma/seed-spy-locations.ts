import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const spyLocations = [
  // Travel
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
      'Check-in Staff',
      'Duty-Free Shop Worker',
      'Air Traffic Controller',
      'Airline Manager',
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
      'Janitor',
      'Cafe Worker',
      'Information Desk Staff',
      'Baggage Porter',
      'Platform Attendant',
    ],
  },
  {
    name: 'Hotel',
    category: 'Travel',
    roles: [
      'Receptionist',
      'Guest',
      'Bellhop',
      'Housekeeper',
      'Concierge',
      'Chef',
      'Waiter',
      'Hotel Manager',
      'Security Guard',
      'Spa Therapist',
    ],
  },
  {
    name: 'Cruise Ship',
    category: 'Travel',
    roles: [
      'Captain',
      'Passenger',
      'Cruise Director',
      'Waiter',
      'Entertainer',
      'Bartender',
      'Lifeguard',
      'Steward',
      'Chef',
      'Deck Hand',
    ],
  },

  // Entertainment
  {
    name: 'Movie Theater',
    category: 'Entertainment',
    roles: [
      'Moviegoer',
      'Ticket Seller',
      'Usher',
      'Projectionist',
      'Concession Stand Worker',
      'Manager',
      'Janitor',
      'Security Guard',
      'Ticket Taker',
      'Popcorn Maker',
    ],
  },
  {
    name: 'Casino',
    category: 'Entertainment',
    roles: [
      'Gambler',
      'Dealer',
      'Pit Boss',
      'Security Guard',
      'Bartender',
      'Waitress',
      'Cashier',
      'Slot Machine Technician',
      'Manager',
      'Valet',
    ],
  },
  {
    name: 'Concert Hall',
    category: 'Entertainment',
    roles: [
      'Musician',
      'Audience Member',
      'Conductor',
      'Usher',
      'Sound Technician',
      'Lighting Technician',
      'Ticket Seller',
      'Security Guard',
      'Stage Manager',
      'Merchandise Seller',
    ],
  },
  {
    name: 'Circus',
    category: 'Entertainment',
    roles: [
      'Acrobat',
      'Spectator',
      'Clown',
      'Animal Trainer',
      'Ringmaster',
      'Ticket Seller',
      'Vendor',
      'Security Guard',
      'Juggler',
      'Magician',
    ],
  },

  // Public Places
  {
    name: 'Hospital',
    category: 'Public',
    roles: [
      'Doctor',
      'Patient',
      'Nurse',
      'Surgeon',
      'Receptionist',
      'Security Guard',
      'Paramedic',
      'Pharmacist',
      'Janitor',
      'Lab Technician',
    ],
  },
  {
    name: 'School',
    category: 'Public',
    roles: [
      'Teacher',
      'Student',
      'Principal',
      'Janitor',
      'Librarian',
      'Security Guard',
      'Cafeteria Worker',
      'Bus Driver',
      'Counselor',
      'Coach',
    ],
  },
  {
    name: 'Library',
    category: 'Public',
    roles: [
      'Librarian',
      'Visitor',
      'Student',
      'Security Guard',
      'Book Cataloguer',
      'IT Specialist',
      'Janitor',
      'Reading Group Leader',
      'Volunteer',
      'Children\'s Section Assistant',
    ],
  },
  {
    name: 'Police Station',
    category: 'Public',
    roles: [
      'Police Officer',
      'Detective',
      'Suspect',
      'Receptionist',
      'Dispatcher',
      'Janitor',
      'Lawyer',
      'Witness',
      'Chief of Police',
      'Forensic Specialist',
    ],
  },

  // Workplace
  {
    name: 'Office',
    category: 'Workplace',
    roles: [
      'Manager',
      'Employee',
      'Receptionist',
      'IT Specialist',
      'Janitor',
      'Security Guard',
      'CEO',
      'Intern',
      'HR Representative',
      'Accountant',
    ],
  },
  {
    name: 'Restaurant',
    category: 'Workplace',
    roles: [
      'Chef',
      'Customer',
      'Waiter',
      'Host',
      'Dishwasher',
      'Bartender',
      'Manager',
      'Sous Chef',
      'Busboy',
      'Sommelier',
    ],
  },
  {
    name: 'Factory',
    category: 'Workplace',
    roles: [
      'Worker',
      'Supervisor',
      'Machine Operator',
      'Quality Control Inspector',
      'Forklift Driver',
      'Janitor',
      'Security Guard',
      'Warehouse Manager',
      'Maintenance Technician',
      'Safety Officer',
    ],
  },
  {
    name: 'Bank',
    category: 'Workplace',
    roles: [
      'Teller',
      'Customer',
      'Manager',
      'Security Guard',
      'Accountant',
      'Loan Officer',
      'Vault Keeper',
      'Receptionist',
      'Armored Car Driver',
      'Financial Advisor',
    ],
  },

  // Recreation
  {
    name: 'Beach',
    category: 'Recreation',
    roles: [
      'Lifeguard',
      'Beachgoer',
      'Surfer',
      'Ice Cream Vendor',
      'Beach Volleyball Player',
      'Parasailing Instructor',
      'Snack Bar Worker',
      'Sunbather',
      'Photographer',
      'Beach Cleaner',
    ],
  },
  {
    name: 'Park',
    category: 'Recreation',
    roles: [
      'Visitor',
      'Park Ranger',
      'Jogger',
      'Dog Walker',
      'Ice Cream Vendor',
      'Gardener',
      'Street Performer',
      'Photographer',
      'Picnicker',
      'Maintenance Worker',
    ],
  },
  {
    name: 'Gym',
    category: 'Recreation',
    roles: [
      'Personal Trainer',
      'Gym Member',
      'Receptionist',
      'Yoga Instructor',
      'Cleaning Staff',
      'Nutritionist',
      'Group Class Instructor',
      'Equipment Maintenance',
      'Manager',
      'Physiotherapist',
    ],
  },
  {
    name: 'Spa',
    category: 'Recreation',
    roles: [
      'Massage Therapist',
      'Client',
      'Receptionist',
      'Esthetician',
      'Nail Technician',
      'Yoga Instructor',
      'Sauna Attendant',
      'Manager',
      'Hairdresser',
      'Aromatherapist',
    ],
  },

  // Additional locations
  {
    name: 'Supermarket',
    category: 'Shopping',
    roles: [
      'Cashier',
      'Shopper',
      'Stock Clerk',
      'Manager',
      'Security Guard',
      'Butcher',
      'Baker',
      'Cleaner',
      'Delivery Person',
      'Customer Service',
    ],
  },
  {
    name: 'Shopping Mall',
    category: 'Shopping',
    roles: [
      'Shopper',
      'Sales Associate',
      'Security Guard',
      'Janitor',
      'Food Court Worker',
      'Store Manager',
      'Window Washer',
      'Santa Claus (seasonal)',
      'Information Desk Staff',
      'Valet',
    ],
  },
  {
    name: 'Zoo',
    category: 'Entertainment',
    roles: [
      'Zookeeper',
      'Visitor',
      'Veterinarian',
      'Tour Guide',
      'Security Guard',
      'Ticket Seller',
      'Gift Shop Worker',
      'Janitor',
      'Photographer',
      'Animal Trainer',
    ],
  },
  {
    name: 'Museum',
    category: 'Culture',
    roles: [
      'Curator',
      'Visitor',
      'Tour Guide',
      'Security Guard',
      'Ticket Seller',
      'Gift Shop Worker',
      'Janitor',
      'Archaeologist',
      'Restoration Expert',
      'Audio Guide Narrator',
    ],
  },
]

async function main() {
  console.log('🌍 Starting Spy game locations seed...')

  for (const location of spyLocations) {
    await prisma.spyLocation.upsert({
      where: { name: location.name },
      update: {
        category: location.category,
        roles: location.roles,
        isActive: true,
      },
      create: {
        name: location.name,
        category: location.category,
        roles: location.roles,
        isActive: true,
      },
    })
    console.log(`✅ ${location.name} (${location.category})`)
  }

  console.log(`\n🎉 Seeded ${spyLocations.length} locations for Spy game!`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding spy locations:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
