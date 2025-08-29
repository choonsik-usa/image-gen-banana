
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Modality, Part} from '@google/genai';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// DOM Elements
const imageInputs: NodeListOf<HTMLInputElement> = document.querySelectorAll('.hidden-file-input');
const imageDropZones: NodeListOf<HTMLElement> = document.querySelectorAll('.image-drop-zone');
const imagePreviews: NodeListOf<HTMLImageElement> = document.querySelectorAll('.image-preview');
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const resultImage = document.getElementById('result-image') as HTMLImageElement;
const statusMessage = document.getElementById('status-message') as HTMLParagraphElement;
const suggestionButtonsContainer = document.getElementById('suggestion-buttons') as HTMLDivElement;
const translateBtn = document.getElementById('translate-btn') as HTMLButtonElement;

// State
const imageParts: (Part | null)[] = [null, null];

const PROMPT_EXAMPLES = [
  { ko: '밤하늘을 나는 우주 고양이', en: 'A space cat flying through the night sky, fantasy art' },
  { ko: '두 이미지를 합쳐 초현실적인 풍경 만들기', en: 'Combine the two images to create a surreal landscape' },
  { ko: '1번 인물을 2번 배경에 합성하기', en: 'Composite the person from image 1 into the background of image 2' },
  { ko: '1번 사진을 유화 스타일로 변경하기', en: 'Make the first image look like an oil painting' },
];

function fileToPart(file: File): Promise<Part> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const base64Data = (e.target.result as string).split(',')[1];
        resolve({
          inlineData: {
            mimeType: file.type,
            data: base64Data,
          },
        });
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateButtonState() {
  const promptEntered = promptInput.value.trim().length > 0;
  generateBtn.disabled = !promptEntered;
}

imageDropZones.forEach((zone, index) => {
    zone.addEventListener('click', () => imageInputs[index].click());
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#6a6aff';
    });
    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#444';
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = '#444';
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            imageInputs[index].files = files;
            const event = new Event('change', { bubbles: true });
            imageInputs[index].dispatchEvent(event);
        }
    });
});

imageInputs.forEach((input, index) => {
  input.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
      // Show preview
      const previewUrl = URL.createObjectURL(file);
      imagePreviews[index].src = previewUrl;
      imagePreviews[index].onload = () => URL.revokeObjectURL(previewUrl);

      // Convert to Part and store
      imageParts[index] = await fileToPart(file);
      updateButtonState();
    }
  });
});

promptInput.addEventListener('input', updateButtonState);

translateBtn.addEventListener('click', async () => {
    const koreanPrompt = promptInput.value.trim();
    if (!koreanPrompt) {
        alert('번역할 내용을 입력해주세요.');
        return;
    }

    translateBtn.disabled = true;
    translateBtn.textContent = '번역 중...';

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: koreanPrompt,
            config: {
                systemInstruction: 'You are an expert translator. Translate the following user-provided text from Korean to English. Provide only the English translation and nothing else, without any introductory phrases.',
            },
        });

        const translatedText = response.text.trim();
        promptInput.value = translatedText;
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));

    } catch (error) {
        console.error("Translation failed:", error);
        statusMessage.textContent = `번역 실패: ${error instanceof Error ? error.message : String(error)}`;
        statusMessage.classList.remove('hidden');
    } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = '번역';
    }
});


generateBtn.addEventListener('click', async () => {
  if (generateBtn.disabled) return;

  // Set loading state
  loader.classList.remove('hidden');
  resultImage.classList.add('hidden');
  statusMessage.classList.add('hidden');
  generateBtn.disabled = true;
  resultImage.src = '';

  try {
    const uploadedImageParts = imageParts.filter(p => p !== null) as Part[];

    if (uploadedImageParts.length > 0) {
      // --- Image Editing with Nano-Banana ---
      const textPart: Part = { text: promptInput.value };
      const requestParts = [...uploadedImageParts, textPart];

      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: requestParts },
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });

      const imageResponsePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

      if (imageResponsePart?.inlineData) {
        const { mimeType, data } = imageResponsePart.inlineData;
        resultImage.src = `data:${mimeType};base64,${data}`;
        resultImage.classList.remove('hidden');
      } else {
          statusMessage.textContent = '이미지를 생성하지 못했습니다. 다른 프롬프트를 시도해 보세요.';
          statusMessage.classList.remove('hidden');
      }
    } else {
      // --- Text-to-Image with Imagen ---
      const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: promptInput.value,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
          },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
          const base64ImageBytes = response.generatedImages[0].image.imageBytes;
          resultImage.src = `data:image/jpeg;base64,${base64ImageBytes}`;
          resultImage.classList.remove('hidden');
      } else {
          statusMessage.textContent = '이미지를 생성하지 못했습니다. 다른 프롬프트를 시도해 보세요.';
          statusMessage.classList.remove('hidden');
      }
    }

  } catch (error) {
    console.error("Error generating image:", error);
    statusMessage.textContent = `오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`;
    statusMessage.classList.remove('hidden');
  } finally {
    // Reset loading state
    loader.classList.add('hidden');
    updateButtonState();
  }
});

/**
 * Creates a placeholder image part and its data URL using Canvas.
 * This avoids network requests for sample images.
 */
function createPlaceholderPart(color: string, width: number, height: number): { part: Part, dataUrl: string } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];
    const part: Part = {
        inlineData: {
            mimeType: 'image/png',
            data: base64Data,
        },
    };
    return { part, dataUrl };
}

/**
 * Initializes the app with locally generated sample images.
 */
async function initializeApp() {
    statusMessage.textContent = '샘플 이미지를 준비하는 중...';
    statusMessage.classList.remove('hidden');
    resultImage.classList.add('hidden');
    loader.classList.add('hidden');

    // Populate prompt suggestions
    PROMPT_EXAMPLES.forEach(example => {
        const btn = document.createElement('button');
        btn.textContent = example.ko;
        btn.classList.add('suggestion-btn');
        btn.title = `영문 프롬프트:\n${example.en}`;
        btn.addEventListener('click', () => {
            promptInput.value = example.en;
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        suggestionButtonsContainer.appendChild(btn);
    });

    try {
        const placeholderColors = ['#ff6b6b', '#48dbfb'];
        const placeholders = placeholderColors.map(color => createPlaceholderPart(color, 300, 300));

        placeholders.forEach((p, index) => {
            imagePreviews[index].src = p.dataUrl;
            imageParts[index] = p.part;
        });
        
        statusMessage.textContent = '프롬프트를 입력해 이미지를 생성하거나, 샘플/업로드 이미지와 함께 사용해 보세요.';

    } catch (error) {
        console.error("Failed to create sample images:", error);
        statusMessage.textContent = '샘플 이미지를 만들지 못했습니다. 이미지를 직접 업로드 해주세요.';
    } finally {
        updateButtonState();
    }
}

initializeApp();