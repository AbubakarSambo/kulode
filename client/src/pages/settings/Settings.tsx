import { Header } from '@/components/layout'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Link } from 'react-router-dom'
import { Building, Users, CreditCard, Tags, Crown } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { useOverscrollBounce } from '@/hooks'

export function SettingsPage() {
  const scrollContainerRef = useOverscrollBounce<HTMLDivElement>()
  const { effectivePlan } = useSubscription()

  const settingsCards = [
    {
      title: 'Organization',
      description: 'Update your business information',
      icon: Building,
      href: '/settings/organization',
    },
    {
      title: 'Users',
      description: 'Manage team members and roles',
      icon: Users,
      href: '/settings/users',
    },
    {
      title: 'Billing & Plans',
      description: 'Manage your subscription and billing',
      icon: Crown,
      href: '/settings/billing',
    },
    {
      title: 'Paystack',
      description: 'Configure payment integration',
      icon: CreditCard,
      href: '/settings/paystack',
    },
    ...(effectivePlan !== 'FREE'
      ? [
          {
            title: 'Expense Categories',
            description: 'Manage expense categories',
            icon: Tags,
            href: '/settings/categories',
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Settings"
        description="Manage your organization settings"
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {settingsCards.map((card) => (
            <Link key={card.href} to={card.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <card.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{card.title}</CardTitle>
                      <CardDescription>{card.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
