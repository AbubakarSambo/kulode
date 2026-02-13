import { Header } from '@/components/layout'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Link } from 'react-router-dom'
import { Building, Users, CreditCard, Tags } from 'lucide-react'

export function SettingsPage() {
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
      title: 'Paystack',
      description: 'Configure payment integration',
      icon: CreditCard,
      href: '/settings/paystack',
    },
    {
      title: 'Expense Categories',
      description: 'Manage expense categories',
      icon: Tags,
      href: '/settings/categories',
    },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Settings"
        description="Manage your organization settings"
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
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
