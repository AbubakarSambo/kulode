import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Mail, Phone, User } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, Badge } from '@/components/ui'
import { vendorsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

export function VendorsListPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const user = useAuthStore((state) => state.user)

  const canCreate = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', { search, page }],
    queryFn: () => vendorsApi.list({ search, page, limit: 20 }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Vendors"
        description="Manage your vendors and suppliers"
        action={
          canCreate ? (
            <Link to="/vendors/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Vendor
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Search */}
        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
        </div>

        {/* Vendors Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No vendors found</p>
            {canCreate && (
              <Link to="/vendors/new">
                <Button className="mt-4">Add your first vendor</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.data.map((vendor) => (
              <Link key={vendor.id} to={`/vendors/${vendor.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{vendor.name}</h3>
                        {vendor.serviceDescription && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                            {vendor.serviceDescription}
                          </p>
                        )}
                      </div>
                      {!vendor.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-1 border-t pt-3">
                      {vendor.contactPerson && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          {vendor.contactPerson}
                        </p>
                      )}
                      {vendor.email && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {vendor.email}
                        </p>
                      )}
                      {vendor.phone && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {vendor.phone}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === data.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
