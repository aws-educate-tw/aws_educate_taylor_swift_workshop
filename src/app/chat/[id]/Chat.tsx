"use client";
import { client, useAIConversation } from "@/client";
import { ReportModal } from "@/components/ReportModal";
import { ConversationsContext } from "@/providers/ConversationsProvider";
import { Avatar, View } from "@aws-amplify/ui-react";
import {
  AIConversation,
  type SendMesageParameters,
} from "@aws-amplify/ui-react-ai";
import * as React from "react";
import ReactMarkdown from "react-markdown";

export const Chat = ({ id }: { id: string }) => {
  const { updateConversation } = React.useContext(ConversationsContext);
  const [initialMessageProcessed, setInitialMessageProcessed] =
    React.useState(false);
  const [imageUrl, setImageUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isButtonDisabled, setIsButtonDisabled] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isInputDisabled, setIsInputDisabled] = React.useState(false);
  const [nextChatId, setNextChatId] = React.useState<string | null>(null);
  const [
    {
      data: { messages, conversation },
      isLoading,
    },
    sendMessage,
  ] = useAIConversation("chat", { id });

  // Send initial message when component mounts
  React.useEffect(() => {
    const initialMessageKey = `initial_message_${id}`;
    const storedMessage = sessionStorage.getItem(initialMessageKey);

    if (
      storedMessage &&
      conversation &&
      !initialMessageProcessed &&
      messages.length === 0
    ) {
      const message = JSON.parse(storedMessage) as SendMesageParameters;
      sendMessage(message);
      setInitialMessageProcessed(true);
      sessionStorage.removeItem(initialMessageKey);

      // Generate chat name
      if (!conversation.name) {
        client.generations
          .chatNamer({
            content: message.content
              .map((content) => ("text" in content ? content.text ?? "" : ""))
              .join(""),
          })
          .then((res) => {
            if (res.data?.name) {
              updateConversation({
                id,
                name: res.data.name,
              });
            }
          });
      }
    }
  }, [
    id,
    conversation,
    messages.length,
    sendMessage,
    updateConversation,
    initialMessageProcessed,
  ]);

  // subscribe
  React.useEffect(() => {
    console.log("subscribe!");
    const subscription = client.subscriptions
      .receiveResult({ sessionId: id })
      .subscribe({
        next: (data) => {
          console.log("receive result", data);
          if (data) {
            setIsButtonDisabled(false);
            setImageUrl(data.imageUrl);
            setDescription(data.description);
            setIsInputDisabled(true); // Disable chat input on valid response
          }
        },
        error: (error) => {
          console.log("Subscription failed...", error);
        },
      });

    return () => subscription.unsubscribe();
  }, [id, sendMessage]);

  const handleButtonClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Move to the next chat session
    setNextChatId(`chat_${Date.now()}`); // Generate new chat ID
  };

  const handleNewMessage = (message: SendMesageParameters) => {
    if (!isInputDisabled) {
      sendMessage(message);
    }

    // Generate name for first user message if not already named
    if (!conversation?.name && messages.length === 0) {
      client.generations
        .chatNamer({
          content: message.content
            .map((content) => ("text" in content ? content.text ?? "" : ""))
            .join(""),
        })
        .then((res) => {
          if (res.data?.name) {
            updateConversation({
              id,
              name: res.data.name,
            });
          }
        });
    }
  };

  if (nextChatId) {
    return <Chat id={nextChatId} />;
  }

  return (
    <View className="flex flex-col h-full w-full" padding="large">
      <div className="flex justify-start items-center mb-3">
        <button
          disabled={isButtonDisabled}
          onClick={handleButtonClick}
          className={`
            px-6 py-2 rounded-lg text-white font-semibold transition-all duration-300
            ${
              isButtonDisabled
                ? "bg-gray-400 cursor-not-allowed hover:bg-gray-400"
                : "bg-gradient-to-r from-[#f2dfb5] to-[#fbc1f1] hover:from-[#f7d6b5] hover:to-[#ffc1f1] shadow-md hover:shadow-lg"
            }
          `}
        >
          Click Me!
        </button>

        {isModalOpen && (
          <ReportModal
            handleCloseModal={handleCloseModal}
            imageUrl={imageUrl}
            description={description}
          />
        )}
      </div>
      <div className="flex-grow overflow-auto">
        <AIConversation
          messages={messages}
          handleSendMessage={isInputDisabled ? undefined : handleNewMessage}
          isLoading={isLoading}
          aiContext={() => {
            return {
              sessionId: id,
            };
          }}
          messageRenderer={{
            text: ({ text }) => (
              <div className="dark:text-gray-200">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            ),
          }}
          avatars={{
            user: {
              avatar: <Avatar src="/images/user.png" />,
              username: "Swifties",
            },
            ai: {
              avatar: <Avatar src="/images/ai.png" />,
              username: "The AI Tour Assistant",
            },
          }}
        />
      </div>
    </View>
  );
};
