type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="p-8">
      <h1>Chat {id}</h1>
    </main>
  );
}