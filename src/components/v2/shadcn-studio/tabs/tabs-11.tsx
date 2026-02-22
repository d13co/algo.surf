import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/components/v2/ui/tabs'
import { cn } from 'src/lib/utils'

interface Tab {
  name: string
  value: string
  content: React.ReactNode
}

interface TabsUnderlineProps {
  tabs: Tab[]
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  listClassName?: string
}

export default function TabsUnderline({
  tabs,
  defaultValue,
  value,
  onValueChange,
  className,
  listClassName,
}: TabsUnderlineProps) {
  return (
    <Tabs
      defaultValue={defaultValue ?? tabs[0]?.value}
      value={value}
      onValueChange={onValueChange}
      className={cn('gap-4', className)}
    >
      <TabsList className={cn('bg-transparent justify-start rounded-none border-b p-0 overflow-x-auto', listClassName)}>
        {tabs.map(tab => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className='bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary h-full rounded-none border-0 border-b-2 border-transparent data-[state=active]:shadow-none'
          >
            {tab.name}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map(tab => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
