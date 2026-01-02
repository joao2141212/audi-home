// Skeleton Loader Components
// Efeito de loading profissional que "engana" enquanto carrega

interface SkeletonProps {
    className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
    return <div className={`skeleton ${className}`} />
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
    return (
        <div className={className}>
            {Array.from({ length: lines }).map((_, i) => (
                <div
                    key={i}
                    className="skeleton skeleton-text"
                    style={{ width: i === lines - 1 ? '60%' : '100%' }}
                />
            ))}
        </div>
    )
}

export function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-4">
                <div className="skeleton w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-3/4 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                </div>
            </div>
            <div className="space-y-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-5/6 rounded" />
            </div>
        </div>
    )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 px-6 py-4 flex gap-8">
                <div className="skeleton h-3 w-20 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 w-16 rounded ml-auto" />
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex gap-8 border-t border-gray-50">
                    <div className="skeleton h-4 w-20 rounded" />
                    <div className="skeleton h-4 w-40 rounded" />
                    <div className="skeleton h-4 w-24 rounded" />
                    <div className="skeleton h-4 w-20 rounded ml-auto" />
                </div>
            ))}
        </div>
    )
}

export function SkeletonDashboard() {
    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    <div className="skeleton h-8 w-64 rounded" />
                    <div className="skeleton h-4 w-40 rounded" />
                </div>
                <div className="flex gap-3">
                    <div className="skeleton h-10 w-28 rounded-lg" />
                    <div className="skeleton h-10 w-36 rounded-lg" />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 p-6">
                        <div className="skeleton h-3 w-24 rounded mb-3" />
                        <div className="skeleton h-8 w-32 rounded mb-2" />
                        <div className="skeleton h-3 w-16 rounded" />
                    </div>
                ))}
            </div>

            {/* Chart + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-xl border border-gray-100 p-6">
                    <div className="skeleton h-5 w-40 rounded mb-6" />
                    <div className="skeleton h-64 w-full rounded-lg" />
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-6">
                    <div className="skeleton h-5 w-32 rounded mb-6" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="skeleton h-16 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
