import { Baby, Coffee, Dog, Leaf, Package, Sparkles } from 'lucide-react'

export const PRODUCT_ICONS = {
  coffee: Coffee,
  cleaning: Sparkles,
  oil: Leaf,
  honey: Leaf,
  baby: Baby,
  pet: Dog,
  other: Package,
}

export function categoryVisual(category) {
  if (category === 'Побутова хімія') return { icon: 'cleaning', art: 'cleaning' }
  if (category === 'Дитячі товари') return { icon: 'baby', art: 'baby' }
  if (category === 'Для тварин') return { icon: 'pet', art: 'pet' }
  if (category === 'Продукти') return { icon: 'coffee', art: 'coffee' }
  return { icon: 'other', art: 'honey' }
}
