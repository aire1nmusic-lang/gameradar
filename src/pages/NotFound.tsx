import { Container } from '@/components/layout/Container'
import { EmptyState } from '@/components/ui/feedback'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <Container className="py-24">
      <EmptyState
        title="Страница не найдена"
        description="Ссылка устарела или была изменена. Начните с главной или найдите сервер через каталог."
        action="На главную"
        actionTo="/"
        secondary={
          <Button variant="outline" to="/catalog">
            Каталог серверов
          </Button>
        }
      />
    </Container>
  )
}
