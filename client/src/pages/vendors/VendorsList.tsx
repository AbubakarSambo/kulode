import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Mail, Phone, User } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input, Card, CardContent, Badge } from '@/components/ui'
import { vendorsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { VendorsIcon } from '@/components/ui/CustomIcons'

const getInitials = (name: string) => {
  const cleanName = name.replace(/^(Mrs\.|Mr\.|Dr\.|Prof\.)\s+/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

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
        icon={VendorsIcon}
        category="Directory"
        badgeText={data?.meta.total}
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
        <div className="mb-6 flex items-center gap-4 sticky top-0 md:static z-20 bg-[#f8f9ff]/95 backdrop-blur-sm py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:bg-transparent md:py-0 md:mb-6 border-b border-[#eef4ff]/30 md:border-b-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.5} />
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-11 rounded-xl bg-white"
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
                <Card className="border-0 bg-white shadow-[0px_8px_24px_rgba(0,55,176,0.03)] rounded-[24px] hover:shadow-[0px_12px_32px_rgba(0,55,176,0.06)] hover:-translate-y-0.5 transition-all duration-300">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100/50 backdrop-blur-md text-slate-650 border border-slate-200/30 shadow-sm flex items-center justify-center text-xs font-bold shrink-0 select-none">
                          {getInitials(vendor.name)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm leading-tight">{vendor.name}</h3>
                          {vendor.serviceDescription && (
                            <p className="mt-1 text-xs text-slate-400 font-medium line-clamp-1">
                              {vendor.serviceDescription}
                            </p>
                          )}
                        </div>
                      </div>
                      {!vendor.isActive && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 uppercase tracking-wider rounded-md shrink-0">Inactive</Badge>
                      )}
                    </div>
                    
                    <div className="mt-4 space-y-2 border-t border-[#eef4ff]/50 pt-4">
                      {vendor.contactPerson && (
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-slate-450" strokeWidth={1.5} />
                          </span>
                          {vendor.contactPerson}
                        </p>
                      )}
                      {vendor.email && (
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center">
                            <Mail className="h-3.5 w-3.5 text-slate-450" strokeWidth={1.5} />
                          </span>
                          {vendor.email}
                        </p>
                      )}
                      {vendor.phone && (
                        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center">
                            <Phone className="h-3.5 w-3.5 text-slate-450" strokeWidth={1.5} />
                          </span>
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

      {/* Mobile Floating Action Button */}
      {canCreate && (
        <Link 
          to="/vendors/new" 
          className="fixed bottom-28 right-6 z-40 sm:hidden w-14 h-14 rounded-full bg-gradient-to-br from-[#0037b0] to-[#1d4ed8] text-white flex items-center justify-center shadow-[0px_8px_24px_rgba(0,55,176,0.25)] hover:scale-105 active:scale-95 transition-all"
          aria-label="Add Vendor"
        >
          <Plus className="h-6 w-6" strokeWidth={1.5} />
        </Link>
      )}
    </div>
  )
}
