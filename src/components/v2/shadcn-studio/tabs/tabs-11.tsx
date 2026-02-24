import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/components/v2/ui/tabs'
import { cn } from 'src/lib/utils'

interface Tab {
  name: string
  value: string
  content?: React.ReactNode
  onClick?: () => void
}

interface TabsUnderlineProps {
  tabs: Tab[]
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  listClassName?: string
  tabsRef?: React.Ref<HTMLDivElement>
}

export default function TabsUnderline({
  tabs,
  defaultValue,
  value,
  onValueChange,
  className,
  listClassName,
  tabsRef,
}: TabsUnderlineProps) {
  const hasContent = tabs.some(tab => tab.content !== undefined)

  return (
    <Tabs
      defaultValue={defaultValue ?? tabs[0]?.value}
      value={value}
      onValueChange={onValueChange}
      className={cn('gap-4', className)}
    >
      <TabsList
        ref={tabsRef}
        className={cn('bg-transparent justify-start rounded-none border-b border-primary p-0 overflow-x-auto', listClassName)}
      >
        {tabs.map(tab => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            onClick={tab.onClick}
            className='bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary h-full rounded-none border-0 border-b-2 border-transparent data-[state=active]:shadow-none data-[state=active]:text-primary pb-2'
          >
            {tab.name}
          </TabsTrigger>
        ))}
      </TabsList>

      {hasContent ? tabs.map(tab => (
        tab.content !== undefined ? (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ) : null
      )) : null}
    </Tabs>
  )
}
