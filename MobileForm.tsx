import React from 'react';

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const MobileForm: React.FC = () => {
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    email: '',
    phone: '',
    message: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  // Shared input classes - text-base prevents mobile zoom
  const inputClasses = "w-full text-base px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all min-h-[48px]";
  
  // Alternative responsive classes
  const responsiveInputClasses = "w-full text-base sm:text-lg px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all min-h-[48px]";

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Mobile-Friendly Form</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Input */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Enter your name"
            className={inputClasses}
            required
          />
        </div>

        {/* Email Input */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="Enter your email"
            className={inputClasses}
            required
          />
        </div>

        {/* Phone Input */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            placeholder="Enter your phone number"
            className={inputClasses}
          />
        </div>

        {/* Message Textarea */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            placeholder="Enter your message"
            rows={4}
            className="w-full text-base px-3 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-vertical"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white text-base font-medium py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors min-h-[48px] active:bg-blue-800"
        >
          Submit Form
        </button>
      </form>

      {/* Examples with different responsive strategies */}
      <div className="mt-8 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Different Font Size Strategies</h3>
        
        {/* Standard approach */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Standard (text-base = 16px)
          </label>
          <input
            type="text"
            placeholder="Always 16px"
            className="w-full text-base px-3 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 min-h-[48px]"
          />
        </div>

        {/* Responsive approach */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Responsive (16px → 18px on sm+)
          </label>
          <input
            type="text"
            placeholder="Responsive sizing"
            className={responsiveInputClasses}
          />
        </div>

        {/* Large mobile approach */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Large Mobile (text-lg = 18px)
          </label>
          <input
            type="text"
            placeholder="Larger on mobile"
            className="w-full text-lg px-3 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 min-h-[48px]"
          />
        </div>
      </div>
    </div>
  );
};

export default MobileForm;